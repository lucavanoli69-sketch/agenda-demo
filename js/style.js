/* =========================
   Estado + utilidades principales
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
    const STORAGE_KEY = "vanoli_agenda_demo_bookings_v1";

    const SERVICE_DURATIONS = {
        "Corte": 30,
        "Corte + barba": 60,
        "Color": 60,
    };

    const state = {
        nombre: "",
        servicio: "",
        fecha: "",
        hora: "",
        duracion: 0,
        panelOpen: false,
        weekOffset: 0,
    };

    /* =========================
       DOM
       ========================= */
    const yearEl = document.getElementById("year");
    const servicesEl = document.getElementById("services");
    const weekDaysEl = document.getElementById("weekDays");
    const prevWeekBtn = document.getElementById("prevWeekBtn");
    const nextWeekBtn = document.getElementById("nextWeekBtn");
    const viewTimesBtn = document.getElementById("viewTimesBtn");
    const timesPanelEl = document.getElementById("timesPanel");
    const timesEl = document.getElementById("times");
    const clientNameEl = document.getElementById("clientName");
    const reserveBtn = document.getElementById("reserveBtn");
    const statusEl = document.getElementById("status");
    const bookingsEl = document.getElementById("bookings");

    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    /* =========================
       Lógica de fechas (generación semanal)
       ========================= */
    function pad2(n) {
        return String(n).padStart(2, "0");
    }

    function todayStartLocal() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function toIsoDateLocal(d) {
        const y = d.getFullYear();
        const m = pad2(d.getMonth() + 1);
        const day = pad2(d.getDate());
        return `${y}-${m}-${day}`;
    }

    function addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    }

    function dayLabelEs(date) {
        const labels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        return labels[date.getDay()];
    }

    function generarSemana(weekOffset) {
        /* Generación de fechas */
        const start = addDays(todayStartLocal(), weekOffset * 7);
        const out = [];
        for (let i = 0; i < 7; i++) out.push(addDays(start, i));
        return out;
    }

    function renderSemana() {
        const days = generarSemana(state.weekOffset);
        weekDaysEl.innerHTML = "";

        if (state.weekOffset > 0) prevWeekBtn.classList.add("is-visible");
        else prevWeekBtn.classList.remove("is-visible");

        days.forEach((d) => {
            const iso = toIsoDateLocal(d);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "day-card";
            btn.dataset.date = iso;
            btn.innerHTML = `
        <p class="day-card__dow">${dayLabelEs(d)}</p>
        <p class="day-card__num">${d.getDate()}</p>
      `;

            if (state.fecha === iso) btn.classList.add("is-selected");

            btn.addEventListener("click", () => seleccionarDia(iso));
            weekDaysEl.appendChild(btn);
        });
    }

    function seleccionarDia(isoDate) {
        /* Selección de día */
        state.fecha = isoDate;
        state.hora = "";
        setStatus("", null);
        if (state.panelOpen) closeTimesPanel();
        syncReserveState();
        renderSemana();
    }

    clientNameEl.addEventListener("input", () => {
        state.nombre = (clientNameEl.value || "").trim();
        syncReserveState();
    });

    /* =========================
       LocalStorage
       ========================= */
    function loadBookings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveBookings(bookings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    }

    function bookingKey(booking) {
        return `${booking.nombre || ""}__${booking.servicio}__${booking.fecha}__${booking.hora}`;
    }

    function slotKey(booking) {
        return `${booking.fecha}__${booking.hora}`;
    }

    /* =========================
       Generación de horarios (bloques de 30 min)
       ========================= */
    function parseTimeToMinutes(hhmm) {
        const [hh, mm] = hhmm.split(":").map((v) => Number(v));
        return hh * 60 + mm;
    }

    function minutesToTime(min) {
        const hh = Math.floor(min / 60);
        const mm = min % 60;
        return `${pad2(hh)}:${pad2(mm)}`;
    }

    function generarHorarios(start = "10:00", end = "18:00", stepMinutes = 30) {
        const startMin = parseTimeToMinutes(start);
        const endMin = parseTimeToMinutes(end);
        const out = [];
        for (let t = startMin; t <= endMin; t += stepMinutes) out.push(minutesToTime(t));
        return out;
    }

    /* =========================
       Render
       ========================= */
    function setStatus(message, variant) {
        statusEl.textContent = message || "";
        statusEl.classList.remove("is-success", "is-error");
        if (variant) statusEl.classList.add(variant);
    }

    function formatDate(isoDate) {
        if (!isoDate) return "";
        const [y, m, d] = isoDate.split("-");
        return `${d}/${m}/${y}`;
    }

    function inferDurationFromService(service) {
        return SERVICE_DURATIONS[service] || 30;
    }

    function getBlockedSlotsForDate(bookings, date, allSlots) {
        /* Validación de disponibilidad (bloqueo por duración) */
        const indexByTime = new Map(allSlots.map((t, i) => [t, i]));
        const blocked = new Set();

        bookings
            .filter((b) => b.fecha === date)
            .forEach((b) => {
                const dur = Number(b.duracion || inferDurationFromService(b.servicio));
                const blocks = Math.max(1, Math.ceil(dur / 30));
                const startIdx = indexByTime.get(b.hora);
                if (startIdx === undefined) return;
                for (let i = 0; i < blocks; i++) {
                    const t = allSlots[startIdx + i];
                    if (t) blocked.add(t);
                }
            });

        return blocked;
    }

    function verificarDisponibilidad({ startTime, duration, allSlots, blockedSlots }) {
        /* Validación de disponibilidad (bloques consecutivos) */
        const blocksNeeded = Math.max(1, Math.ceil(duration / 30));
        const startIdx = allSlots.indexOf(startTime);
        if (startIdx < 0) return false;

        for (let i = 0; i < blocksNeeded; i++) {
            const t = allSlots[startIdx + i];
            if (!t) return false;
            if (blockedSlots.has(t)) return false;
        }

        return true;
    }

    function renderHorarios() {
        /* Renderizado de horarios */
        const allSlots = generarHorarios("10:00", "18:00", 30);
        const bookings = loadBookings();
        const blockedSlots = getBlockedSlotsForDate(bookings, state.fecha, allSlots);
        const duration = state.duracion || inferDurationFromService(state.servicio);

        timesEl.innerHTML = "";

        const availableStarts = allSlots.filter((t) =>
            verificarDisponibilidad({ startTime: t, duration, allSlots, blockedSlots })
        );

        if (availableStarts.length === 0) {
            timesEl.innerHTML = `<div class="times-empty is-error">No hay disponibilidad para este servicio en este día</div>`;
            state.hora = "";
            syncReserveState();
            return;
        }

        allSlots.forEach((time) => {
            const isBlocked = blockedSlots.has(time);
            const canStartHere = verificarDisponibilidad({ startTime: time, duration, allSlots, blockedSlots });

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "time-btn";

            if (isBlocked) {
                btn.textContent = `${time} · Ocupado`;
                btn.disabled = true;
                btn.classList.add("is-occupied");
            } else if (!canStartHere) {
                btn.textContent = `${time} · No disponible`;
                btn.disabled = true;
                btn.classList.add("is-unavailable");
            } else {
                btn.textContent = time;
                btn.disabled = false;
            }

            if (state.hora === time) btn.classList.add("is-selected");

            btn.addEventListener("click", () => {
                if (btn.disabled) return;
                state.hora = time;
                setStatus("", null);
                renderHorarios();
                syncReserveState();
            });

            timesEl.appendChild(btn);
        });
    }

    function openTimesPanel() {
        /* Apertura del panel */
        timesPanelEl.classList.add("is-open");
        state.panelOpen = true;
        renderHorarios();
    }

    function closeTimesPanel() {
        timesPanelEl.classList.remove("is-open");
        state.panelOpen = false;
    }

    function renderBookings() {
        /* Renderizado de turnos */
        const bookings = loadBookings()
            .slice()
            .sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`));

        bookingsEl.innerHTML = "";

        if (bookings.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "Todavía no hay turnos guardados. Reservá el primero.";
            bookingsEl.appendChild(empty);
            return;
        }

        bookings.forEach((b) => {
            const item = document.createElement("div");
            item.className = "booking";
            item.dataset.key = bookingKey(b);
            const nombre = (b.nombre || "").trim() || "Sin nombre";
            item.innerHTML = `
        <div class="booking__row">
          <p class="booking__service">${nombre} - ${b.servicio}</p>
          <div class="booking__actions">
            <p class="booking__time">${b.hora}</p>
            <button class="booking__delete" type="button" data-action="delete">Eliminar</button>
          </div>
        </div>
        <p class="booking__date">${formatDate(b.fecha)}</p>
      `;
            bookingsEl.appendChild(item);
        });
    }

    function syncReserveState() {
        const ok = Boolean(state.nombre && state.servicio && state.fecha && state.hora);
        reserveBtn.disabled = !ok;
    }

    /* =========================
       Interacciones principales
       ========================= */
    servicesEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-service]");
        if (!btn) return;

        state.servicio = btn.getAttribute("data-service") || "";
        state.duracion = inferDurationFromService(state.servicio);
        state.hora = "";
        setStatus("", null);

        servicesEl.querySelectorAll(".service-card").forEach((card) => {
            card.classList.toggle("is-selected", card === btn);
        });

        if (state.panelOpen) closeTimesPanel();
        syncReserveState();
    });

    nextWeekBtn.addEventListener("click", () => {
        /* Navegación de semanas */
        state.weekOffset += 1;
        state.fecha = "";
        state.hora = "";
        setStatus("", null);
        if (state.panelOpen) closeTimesPanel();
        syncReserveState();
        renderSemana();
    });

    prevWeekBtn.addEventListener("click", () => {
        /* Navegación de semanas */
        state.weekOffset = Math.max(0, state.weekOffset - 1);
        state.fecha = "";
        state.hora = "";
        setStatus("", null);
        if (state.panelOpen) closeTimesPanel();
        syncReserveState();
        renderSemana();
    });

    viewTimesBtn.addEventListener("click", () => {
        setStatus("", null);

        if (!state.servicio || !state.fecha) {
            setStatus("Seleccioná servicio y fecha primero", "is-error");
            closeTimesPanel();
            return;
        }

        openTimesPanel();
    });

    reserveBtn.addEventListener("click", () => {
        setStatus("", null);

        /* Validación del nombre */
        const nombre = (clientNameEl.value || "").trim();
        if (!nombre) {
            setStatus("Ingresá tu nombre", "is-error");
            syncReserveState();
            return;
        }
        state.nombre = nombre;

        if (!state.servicio || !state.fecha || !state.hora) {
            if (!state.servicio || !state.fecha) setStatus("Seleccioná servicio y fecha primero", "is-error");
            else setStatus("Seleccioná un horario válido", "is-error");
            return;
        }

        const bookings = loadBookings();
        const newBooking = {
            nombre: state.nombre,
            servicio: state.servicio,
            fecha: state.fecha,
            hora: state.hora,
            duracion: state.duracion || inferDurationFromService(state.servicio),
        };

        const allSlots = generarHorarios("10:00", "18:00", 30);
        const blockedSlots = getBlockedSlotsForDate(bookings, state.fecha, allSlots);
        const ok = verificarDisponibilidad({
            startTime: newBooking.hora,
            duration: newBooking.duracion,
            allSlots,
            blockedSlots,
        });

        if (!ok) {
            setStatus("Seleccioná un horario válido", "is-error");
            if (state.panelOpen) renderHorarios();
            return;
        }

        bookings.push(newBooking);
        /* Guardado en localStorage */
        saveBookings(bookings);

        setStatus(`Turno reservado para ${state.nombre}`, "is-success");

        state.hora = "";
        if (state.panelOpen) renderHorarios();
        renderBookings();
        syncReserveState();
    });

    /* =========================
       Eliminar turno
       ========================= */
    function deleteBookingByKey(key) {
        /* Manejo de localStorage */
        const bookings = loadBookings();
        const next = bookings.filter((b) => bookingKey(b) !== key);
        saveBookings(next);
    }

    bookingsEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action='delete']");
        if (!btn) return;

        const card = btn.closest(".booking");
        const key = card?.dataset?.key;
        if (!key) return;

        /* Lógica importante: confirma y elimina SOLO el seleccionado */
        const ok = confirm("¿Querés eliminar este turno?");
        if (!ok) return;

        deleteBookingByKey(key);
        setStatus("Turno eliminado correctamente.", "is-success");

        renderBookings();
        if (state.panelOpen && state.fecha) renderHorarios();
        syncReserveState();
    });

    /* =========================
    Init
       ========================= */
    reserveBtn.disabled = true;
    closeTimesPanel();
    renderSemana();
    renderBookings();
});
