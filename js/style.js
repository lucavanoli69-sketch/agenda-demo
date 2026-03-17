/* =========================
   Estado + utilidades principales
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
    const STORAGE_KEY = "vanoli_agenda_demo_bookings_v1";
    const AVAILABLE_TIMES = ["10:00", "11:00", "12:00", "13:00"];

    const state = {
        servicio: "",
        fecha: "",
        hora: "",
    };

    /* =========================
       DOM
       ========================= */
    const yearEl = document.getElementById("year");
    const servicesEl = document.getElementById("services");
    const dateEl = document.getElementById("date");
    const timesEl = document.getElementById("times");
    const reserveBtn = document.getElementById("reserveBtn");
    const statusEl = document.getElementById("status");
    const bookingsEl = document.getElementById("bookings");

    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

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
        return `${booking.fecha}__${booking.hora}`;
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

    function getOccupiedTimesForDate(bookings, date) {
        return new Set(bookings.filter((b) => b.fecha === date).map((b) => b.hora));
    }

    function renderTimes() {
        const bookings = loadBookings();
        const occupied = state.fecha ? getOccupiedTimesForDate(bookings, state.fecha) : new Set();

        timesEl.innerHTML = "";

        AVAILABLE_TIMES.forEach((time) => {
            const isOccupied = occupied.has(time);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "time-btn";
            btn.textContent = isOccupied ? `${time} · Ocupado` : time;
            btn.disabled = !state.fecha || isOccupied;

            if (isOccupied) btn.classList.add("is-occupied");
            if (state.hora === time) btn.classList.add("is-selected");

            btn.addEventListener("click", () => {
                state.hora = time;
                setStatus("", null);
                renderTimes();
                syncReserveState();
            });

            timesEl.appendChild(btn);
        });
    }

    function renderBookings() {
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
            item.innerHTML = `
        <div class="booking__row">
          <p class="booking__service">${b.servicio}</p>
          <p class="booking__time">${b.hora}</p>
        </div>
        <p class="booking__date">${formatDate(b.fecha)}</p>
      `;
            bookingsEl.appendChild(item);
        });
    }

    function syncReserveState() {
        const ok = Boolean(state.servicio && state.fecha && state.hora);
        reserveBtn.disabled = !ok;
    }

    /* =========================
       Interacciones principales
       ========================= */
    servicesEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-service]");
        if (!btn) return;

        state.servicio = btn.getAttribute("data-service") || "";
        setStatus("", null);

        servicesEl.querySelectorAll(".service-card").forEach((card) => {
            card.classList.toggle("is-selected", card === btn);
        });

        syncReserveState();
    });

    dateEl.addEventListener("change", () => {
        state.fecha = dateEl.value || "";
        state.hora = "";
        setStatus("", null);
        renderTimes();
        syncReserveState();
    });

    reserveBtn.addEventListener("click", () => {
        setStatus("", null);

        if (!state.servicio || !state.fecha || !state.hora) {
            setStatus("Completá servicio, fecha y horario para reservar.", "is-error");
            return;
        }

        const bookings = loadBookings();
        const newBooking = { servicio: state.servicio, fecha: state.fecha, hora: state.hora };

        const existingKeys = new Set(bookings.map(bookingKey));
        if (existingKeys.has(bookingKey(newBooking))) {
            setStatus("Ese horario ya está ocupado para esa fecha. Elegí otro.", "is-error");
            renderTimes();
            return;
        }

        bookings.push(newBooking);
        saveBookings(bookings);

        setStatus("Turno reservado. ¡Listo! Ya quedó guardado en tu navegador.", "is-success");

        state.hora = "";
        renderTimes();
        renderBookings();
        syncReserveState();
    });

    /* =========================
    Init
       ========================= */
    reserveBtn.disabled = true;
    renderTimes();
    renderBookings();
});
