import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Radio,
  Search,
  Ship,
} from "lucide-react";


import api from "../Services/api";


const STORAGE_KEY = "oiltrace.ais-screening.form.v1";


const EMPTY_FORM = {
  latitude: "",
  longitude: "",
  observedAt: "",
  lookbackHours: "6",
  radiusKm: "10",
  artificialTest: false,
};


const TEST_FORM = {
  latitude: "25.77005",
  longitude: "-80.14046",
  observedAt: "2026-10-31T13:42:00Z",
  lookbackHours: "1",
  radiusKm: "1",
  artificialTest: true,
};


const FORM_FIELDS = [
  "latitude",
  "longitude",
  "observedAt",
  "lookbackHours",
  "radiusKm",
];


const OBSERVATION_PARAMS = [
  "latitude",
  "longitude",
  "observed_at",
  "lookback_hours",
  "radius_km",
  "artificial_test",
];


const PANEL =
  "rounded-2xl border border-white/10 bg-white/[0.03] p-5";


const INPUT =
  "mt-2 w-full rounded-xl border border-white/15 bg-[#020617] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400 disabled:opacity-50";


function readSavedForm() {
  try {
    const saved = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) || "null"
    );


    const restored = { ...EMPTY_FORM };


    if (saved && typeof saved === "object") {
      for (const field of FORM_FIELDS) {
        if (typeof saved[field] === "string") {
          restored[field] = saved[field];
        }
      }


      restored.artificialTest = saved.artificialTest === true;
    }


    return restored;
  } catch {
    return { ...EMPTY_FORM };
  }
}


function saveForm(form) {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(form)
    );
    return true;
  } catch {
    return false;
  }
}


function readIncomingForm(params) {
  const incoming = {
    latitude: params.get("latitude"),
    longitude: params.get("longitude"),
    observedAt: params.get("observed_at"),
    lookbackHours: params.get("lookback_hours"),
    radiusKm: params.get("radius_km"),
    artificialTest: params.get("artificial_test") === "1",
  };


  const complete = FORM_FIELDS.every(
    (field) =>
      typeof incoming[field] === "string" &&
      incoming[field].trim() !== ""
  );


  return complete ? incoming : null;
}


function validateObservation(form) {
  for (const field of FORM_FIELDS) {
    if (!form[field].trim()) {
      return (
        "Enter latitude, longitude, observation time, " +
        "look-back hours, and radius."
      );
    }
  }


  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);
  const lookback = Number(form.lookbackHours);
  const radius = Number(form.radiusKm);


  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    return "Latitude must be between -90 and 90.";
  }


  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return "Longitude must be between -180 and 180.";
  }


  const observedAt = form.observedAt.trim();


  const match = observedAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/i
  );


  if (!match) {
    return (
      "Use an ISO timestamp with timezone, such as " +
      "2026-10-31T13:42:00Z or " +
      "2026-10-31T19:12:00+05:30."
    );
  }


  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    zone,
  ] = match;


  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText || "0");


  const leapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);


  const daysPerMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];


  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysPerMonth[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return "Enter a valid calendar date and time.";
  }


  if (zone.toUpperCase() !== "Z") {
    const offsetHours = Number(zone.slice(1, 3));
    const offsetMinutes = Number(zone.slice(4, 6));


    if (offsetHours > 23 || offsetMinutes > 59) {
      return "Enter a valid timezone offset.";
    }
  }


  if (Number.isNaN(new Date(observedAt).getTime())) {
    return "Enter a valid observation timestamp.";
  }


  if (
    !Number.isFinite(lookback) ||
    lookback <= 0 ||
    lookback > 72
  ) {
    return "Look-back must be greater than 0 and at most 72 hours.";
  }


  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    radius > 100
  ) {
    return "Radius must be greater than 0 and at most 100 km.";
  }


  return "";
}


function formatNumber(value, decimals = 2, unit = "") {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && !value.trim())
  ) {
    return "Unavailable";
  }


  const parsed = Number(value);


  return Number.isFinite(parsed)
    ? `${parsed.toFixed(decimals)}${unit}`
    : "Unavailable";
}


function formatTime(value) {
  if (!value) return "Unavailable";


  const date = new Date(value);


  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : `${date.toISOString().replace("T", " ").replace("Z", "")} UTC`;
}


function errorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;


  if (typeof detail === "string") {
    return detail;
  }


  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const location = Array.isArray(item?.loc)
          ? item.loc.join(".")
          : "";


        return `${location ? `${location}: ` : ""}${
          typeof item?.msg === "string"
            ? item.msg
            : "Invalid request."
        }`;
      })
      .join(" ");
  }


  if (error?.code === "ECONNABORTED") {
    return "The API request timed out. Check the backend terminal.";
  }


  if (error?.response?.status) {
    return `API request failed (${error.response.status}).`;
  }


  return error?.message || fallback;
}


async function fetchJson(path, signal, params) {
  const response = await api.get(path, {
    signal,
    params,
    headers: {
      "Cache-Control": "no-cache",
    },
  });


  const data = response.data;


  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The API returned an invalid response.");
  }


  return data;
}


function Field({ label, children }) {
  return (
    <label className="block text-xs font-medium text-slate-400">
      {label}
      {children}
    </label>
  );
}


export default function VesselAttribution() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryString = searchParams.toString();


  const [form, setForm] = useState(
    () => readIncomingForm(searchParams) || readSavedForm()
  );


  const [storageError, setStorageError] = useState("");
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);


  const [result, setResult] = useState(null);
  const [resultIsTest, setResultIsTest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");


  const mountedRef = useRef(false);
  const statusRequestRef = useRef(0);
  const screeningRequestRef = useRef(0);
  const statusControllerRef = useRef(null);
  const screeningControllerRef = useRef(null);


  function persist(nextForm) {
    const saved = saveForm(nextForm);


    setStorageError(
      saved
        ? ""
        : "Browser session storage is unavailable. Inputs may be lost on reload."
    );
  }


  function cancelScreening() {
    screeningRequestRef.current += 1;
    screeningControllerRef.current?.abort();
    screeningControllerRef.current = null;
    setLoading(false);
  }


  useEffect(() => {
    mountedRef.current = true;


    return () => {
      mountedRef.current = false;
      statusRequestRef.current += 1;
      screeningRequestRef.current += 1;
      statusControllerRef.current?.abort();
      screeningControllerRef.current?.abort();
    };
  }, []);


  useEffect(() => {
    const params = new URLSearchParams(queryString);
    const incoming = readIncomingForm(params);


    if (!incoming) {
      const hasObservationParams = OBSERVATION_PARAMS.some(
        (name) => params.has(name)
      );


      if (hasObservationParams) {
        setError(
          "The observation URL is incomplete. Saved inputs were kept; enter the missing details or return to Spill Analysis."
        );
      }


      return;
    }


    screeningRequestRef.current += 1;
    screeningControllerRef.current?.abort();
    screeningControllerRef.current = null;


    setLoading(false);
    setForm(incoming);
    setResult(null);
    setError("");
    setSearch("");


    const saved = saveForm(incoming);


    setStorageError(
      saved
        ? ""
        : "Browser session storage is unavailable. Inputs may be lost on reload."
    );


    for (const name of OBSERVATION_PARAMS) {
      params.delete(name);
    }


    setSearchParams(params, { replace: true });
  }, [queryString, setSearchParams]);


  async function loadStatus() {
    statusControllerRef.current?.abort();


    const controller = new AbortController();
    const requestId = ++statusRequestRef.current;
    statusControllerRef.current = controller;


    setStatusLoading(true);
    setStatusError("");


    try {
      const data = await fetchJson(
        "/ais/status",
        controller.signal
      );


      if (
        mountedRef.current &&
        requestId === statusRequestRef.current
      ) {
        setStatus(data);
      }
    } catch (requestError) {
      if (
        mountedRef.current &&
        requestId === statusRequestRef.current &&
        !controller.signal.aborted
      ) {
        setStatusError(
          errorMessage(requestError, "Status request failed.")
        );
      }
    } finally {
      if (
        mountedRef.current &&
        requestId === statusRequestRef.current
      ) {
        setStatusLoading(false);
        statusControllerRef.current = null;
      }
    }
  }


  useEffect(() => {
    loadStatus();


    return () => {
      statusRequestRef.current += 1;
      statusControllerRef.current?.abort();
    };
    // Initial status check; manual checks use the same function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  function applyForm(nextForm) {
    cancelScreening();
    persist(nextForm);
    setForm(nextForm);
    setResult(null);
    setError("");
    setSearch("");
  }


  function updateField(field, value) {
    applyForm({ ...form, [field]: value });
  }


  async function runScreening() {
    if (screeningControllerRef.current) return;


    const validationError = validateObservation(form);


    if (validationError) {
      setResult(null);
      setError(validationError);
      return;
    }


    const submittedForm = { ...form };
    persist(submittedForm);


    const controller = new AbortController();
    const requestId = ++screeningRequestRef.current;
    screeningControllerRef.current = controller;


    setLoading(true);
    setResult(null);
    setError("");
    setSearch("");


    try {
      const data = await fetchJson(
        "/ais/candidates",
        controller.signal,
        {
          latitude: Number(submittedForm.latitude),
          longitude: Number(submittedForm.longitude),
          observed_at: new Date(
            submittedForm.observedAt.trim()
          ).toISOString(),
          lookback_hours: Number(submittedForm.lookbackHours),
          radius_km: Number(submittedForm.radiusKm),
          limit: 100,
        }
      );


      if (
        typeof data.status !== "string" ||
        !Array.isArray(data.candidates)
      ) {
        throw new Error(
          "The screening API response is missing status or candidates."
        );
      }


      if (
        mountedRef.current &&
        requestId === screeningRequestRef.current
      ) {
        setResultIsTest(submittedForm.artificialTest);
        setResult(data);
      }
    } catch (requestError) {
      if (
        mountedRef.current &&
        requestId === screeningRequestRef.current &&
        !controller.signal.aborted
      ) {
        setError(
          errorMessage(requestError, "Vessel screening failed.")
        );
      }
    } finally {
      if (
        mountedRef.current &&
        requestId === screeningRequestRef.current
      ) {
        setLoading(false);
        screeningControllerRef.current = null;
      }
    }
  }


  const candidates = Array.isArray(result?.candidates)
    ? result.candidates
    : [];


  const searchText = search.trim().toLowerCase();


  const filteredCandidates = candidates.filter((vessel) =>
    `${vessel.vessel_name || ""} ${vessel.mmsi || ""}`
      .toLowerCase()
      .includes(searchText)
  );


  const fresh =
    !statusLoading &&
    !statusError &&
    status?.data_freshness === "recent";


  const freshnessLabels = {
    recent: "RECENT AIS DATA",
    stale: "SAVED DATA IS STALE",
    clock_mismatch: "CLOCK MISMATCH",
    no_data: "NO SAVED AIS DATA",
  };


  const statusText = statusLoading
    ? "CHECKING SAVED DATA"
    : statusError
      ? "STATUS UNAVAILABLE"
      : freshnessLabels[status?.data_freshness] ||
        "FRESHNESS UNAVAILABLE";


  const limitations = Array.isArray(result?.limitations)
    ? result.limitations
    : [];


  return (
    <main className="min-h-screen space-y-6 bg-[#020617] p-4 text-slate-100 md:p-6">
      <header className="flex flex-col justify-between gap-4 xl:flex-row">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-400">
              <Ship size={16} />
              AIS location and time screening
            </div>


            <button
              type="button"
              onClick={() => navigate("/spill-analysis")}
              className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-300"
            >
              <ArrowLeft size={16} />
              Back to Spill Analysis
            </button>
          </div>


          <h1 className="mt-3 text-3xl font-bold">
            Vessel Attribution
          </h1>


          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Search saved vessel positions near an observation.
            Matches are investigative screening results, not proof
            that a vessel caused a spill.
          </p>
        </div>


        <section className={`${PANEL} xl:max-w-md`}>
          <p
            className={`flex items-center gap-2 text-xs font-semibold ${
              fresh ? "text-emerald-400" : "text-amber-300"
            }`}
          >
            <Radio size={15} />
            {statusText}
          </p>


          <p className="mt-3 text-xs text-slate-400">
            Latest receipt:{" "}
            {formatTime(status?.last_received_at_utc)}
          </p>


          <p className="mt-2 text-xs text-slate-500">
            Saved-data freshness does not verify the collector's
            WebSocket connection or complete vessel coverage.
          </p>


          {statusError && (
            <p className="mt-2 text-xs text-red-300">
              {statusError}
            </p>
          )}


          <button
            type="button"
            disabled={statusLoading}
            onClick={loadStatus}
            className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-50"
          >
            {statusLoading
              ? "Checking…"
              : "Check data freshness"}
          </button>
        </section>
      </header>


      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-200">
        This page screens recorded positions against a supplied
        point and time. It does not run image prediction or
        calculate drift, predicted trajectories, or responsibility.
        The ranking uses closest recorded distance; time difference
        breaks distance ties.
      </section>


      {form.artificialTest && (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm font-semibold text-amber-200">
          ARTIFICIAL TEST METADATA — NOT A VERIFIED SPILL OBSERVATION
        </section>
      )}


      <section className={PANEL}>
        <h2 className="text-xl font-semibold">
          Observation details
        </h2>


        <p className="mt-2 text-xs leading-5 text-slate-400">
          Incoming observation values are saved and then removed
          from this URL. Reloading restores saved edits. A new
          handoff from Spill Analysis replaces these inputs.
          Screening results are not saved across reloads.
        </p>


        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Latitude">
            <input
              type="number"
              step="any"
              min="-90"
              max="90"
              placeholder="Latitude"
              value={form.latitude}
              disabled={loading}
              onChange={(event) =>
                updateField("latitude", event.target.value)
              }
              className={INPUT}
            />
          </Field>


          <Field label="Longitude">
            <input
              type="number"
              step="any"
              min="-180"
              max="180"
              placeholder="Longitude"
              value={form.longitude}
              disabled={loading}
              onChange={(event) =>
                updateField("longitude", event.target.value)
              }
              className={INPUT}
            />
          </Field>


          <Field label="Observation timestamp with timezone">
            <input
              type="text"
              placeholder="YYYY-MM-DDTHH:mm:ssZ"
              value={form.observedAt}
              disabled={loading}
              onChange={(event) =>
                updateField("observedAt", event.target.value)
              }
              className={INPUT}
            />
          </Field>


          <Field label="Look-back window in hours">
            <input
              type="number"
              step="any"
              min="0"
              max="72"
              value={form.lookbackHours}
              disabled={loading}
              onChange={(event) =>
                updateField("lookbackHours", event.target.value)
              }
              className={INPUT}
            />
          </Field>


          <Field label="Search radius in kilometres">
            <input
              type="number"
              step="any"
              min="0"
              max="100"
              value={form.radiusKm}
              disabled={loading}
              onChange={(event) =>
                updateField("radiusKm", event.target.value)
              }
              className={INPUT}
            />
          </Field>
        </div>


        <label className="mt-5 flex items-start gap-3 text-sm text-amber-200">
          <input
            type="checkbox"
            checked={form.artificialTest}
            disabled={loading}
            onChange={(event) =>
              updateField("artificialTest", event.target.checked)
            }
            className="mt-1"
          />
          This is an artificial test, not a verified spill
          observation.
        </label>


        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={runScreening}
            className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {loading ? "Screening…" : "Screen recorded vessels"}
          </button>


          <button
            type="button"
            disabled={loading}
            onClick={() => applyForm({ ...TEST_FORM })}
            className="rounded-xl border border-white/15 px-5 py-3 text-sm disabled:opacity-50"
          >
            Load artificial test
          </button>


          <button
            type="button"
            disabled={loading}
            onClick={() => applyForm({ ...EMPTY_FORM })}
            className="rounded-xl border border-white/15 px-5 py-3 text-sm text-slate-400 disabled:opacity-50"
          >
            Clear form
          </button>
        </div>


        {storageError && (
          <p role="alert" className="mt-4 text-sm text-amber-300">
            {storageError}
          </p>
        )}
      </section>


      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300"
        >
          <AlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}


      {result && (
        <>
          {resultIsTest && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm font-semibold text-amber-200">
              ARTIFICIAL TEST RESULTS — NOT A REAL SPILL
              INVESTIGATION
            </div>
          )}


          <section className={PANEL}>
            <h2 className="text-lg font-semibold">
              Screening results
            </h2>


            <p className="mt-2 text-xs text-slate-400">
              Point: {formatNumber(result.query?.latitude, 6)},{" "}
              {formatNumber(result.query?.longitude, 6)} · Radius:{" "}
              {formatNumber(result.query?.radius_km, 2, " km")}
            </p>


            <p className="mt-2 text-xs leading-5 text-slate-400">
              Window: {formatTime(result.query?.window_start_utc)}
              {" → "}
              {formatTime(result.query?.observed_at_utc)}
            </p>


            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["Positions in window", result.positions_in_time_window],
                ["Vessels in window", result.vessels_in_time_window],
                ["Matching vessels", result.total_candidates],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/5 p-4">
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {value ?? "Unavailable"}
                  </p>
                </div>
              ))}
            </div>


            <p className="mt-4 text-xs text-slate-400">
              {result.ranking_method}
            </p>


            {result.total_candidates > candidates.length && (
              <p className="mt-2 text-xs text-amber-300">
                Returned {candidates.length} of{" "}
                {result.total_candidates} matches.
              </p>
            )}
          </section>


          {result.status === "no_matching_time_data" ? (
            <section className={PANEL}>
              <h3 className="font-semibold text-amber-300">
                No matching AIS history
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                No accepted stored positions fall within this time
                window. Screening is unavailable for this query.
                This does not prove that no vessels were present.
              </p>
            </section>
          ) : result.status === "no_positions_within_radius" ? (
            <section className={PANEL}>
              <h3 className="font-semibold">
                No recorded positions within the selected radius
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Positions exist in the time window, but none meet
                the radius filter. The collection may be incomplete.
              </p>
            </section>
          ) : (
            <section className="space-y-3">
              <label className="flex items-center gap-3 rounded-xl border border-white/10 px-4">
                <Search size={17} className="shrink-0 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter returned names or MMSIs"
                  className="w-full bg-transparent py-4 text-sm outline-none"
                />
              </label>


              {filteredCandidates.map((vessel) => {
                const point = vessel.closest_recorded_position || {};


                const details = [
                  [
                    "Computed separation",
                    formatNumber(vessel.distance_km, 3, " km"),
                  ],
                  [
                    "Before observation",
                    formatNumber(
                      vessel.time_difference_minutes,
                      1,
                      " min"
                    ),
                  ],
                  [
                    "Positions in window",
                    vessel.positions_in_time_window,
                  ],
                  [
                    "Positions within radius",
                    vessel.positions_within_radius,
                  ],
                  [
                    "Recorded speed",
                    formatNumber(point.speed_knots, 1, " kn"),
                  ],
                  [
                    "Recorded heading",
                    formatNumber(point.heading_degrees, 0, "°"),
                  ],
                  ["Latitude", formatNumber(point.latitude, 6)],
                  ["Longitude", formatNumber(point.longitude, 6)],
                ];


                const reasons = Array.isArray(vessel.reasons)
                  ? vessel.reasons
                  : [];


                return (
                  <article key={vessel.mmsi} className={PANEL}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">
                          #{vessel.rank}{" "}
                          {vessel.vessel_name || "Unknown Vessel"}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                          MMSI {vessel.mmsi}
                          {vessel.call_sign
                            ? ` · Call sign ${vessel.call_sign}`
                            : ""}
                        </p>
                      </div>


                      <span className="rounded-full border border-cyan-400/20 px-3 py-1 text-xs text-cyan-300">
                        Proximity/time match only
                      </span>
                    </div>


                    <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {details.map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-xs text-slate-500">
                            {label}
                          </dt>
                          <dd className="mt-1 text-sm">
                            {value ?? "Unavailable"}
                          </dd>
                        </div>
                      ))}
                    </dl>


                    <p className="mt-4 text-xs text-slate-400">
                      Closest report:{" "}
                      {formatTime(point.provider_message_time_utc)}
                    </p>


                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Computed separation does not establish position
                      accuracy. Gaps between messages are unobserved.
                      No responsibility determination has been made.
                    </p>


                    <details className="mt-4 text-xs text-slate-400">
                      <summary className="cursor-pointer text-cyan-300">
                        Supporting evidence
                      </summary>


                      <ul className="mt-3 list-disc space-y-2 pl-5">
                        {reasons.map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ))}
                      </ul>
                    </details>
                  </article>
                );
              })}


              {filteredCandidates.length === 0 && (
                <div className={PANEL}>
                  {candidates.length === 0
                    ? "The API returned no candidate records."
                    : "No returned vessels match the text filter."}
                </div>
              )}
            </section>
          )}


          <section className={PANEL}>
            <h2 className="font-semibold">Limitations</h2>


            <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-slate-400">
              {limitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}