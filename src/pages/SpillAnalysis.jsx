import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Droplets,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";


import { predictSpill } from "../Services/api";


const STORAGE_KEY = "oiltrace.spill-analysis.form.v1";
const MANUAL_PREDICTION_KEY =
  "oiltrace.latest-manual-prediction.v1";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;


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
      for (const field of [
        "latitude",
        "longitude",
        "observedAt",
        "lookbackHours",
        "radiusKm",
      ]) {
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


function saveManualPrediction(prediction, fileName) {
  try {
    window.sessionStorage.setItem(
      MANUAL_PREDICTION_KEY,
      JSON.stringify({
        result_id: `manual-${Date.now()}`,
        image: fileName,
        processed_at: new Date().toISOString(),
        has_spill: prediction.has_spill,
        oil_pixel_fraction:
          prediction.oil_pixel_fraction ?? null,
        regions: Array.isArray(prediction.regions)
          ? prediction.regions
          : [],
        alert: prediction.alert ?? null,
        model: prediction.model ?? null,
        source: "manual_upload",
      })
    );
  } catch {
    // The prediction still displays even if session storage is unavailable.
  }
}


function validateObservation(form) {
  const fields = [
    ["latitude", "Enter a latitude."],
    ["longitude", "Enter a longitude."],
    ["observedAt", "Enter the observation timestamp."],
    ["lookbackHours", "Enter a look-back window in hours."],
    ["radiusKm", "Enter a search radius in kilometres."],
  ];


  for (const [field, message] of fields) {
    if (!form[field].trim()) {
      return message;
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


  const timestampMatch = observedAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/i
  );


  if (!timestampMatch) {
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
  ] = timestampMatch;


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


function formatNumber(value, decimals = 2) {
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
    ? parsed.toFixed(decimals)
    : "Unavailable";
}


function formatPercentage(value, decimals = 2) {
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
    ? `${(parsed * 100).toFixed(decimals)}%`
    : "Unavailable";
}


function predictionErrorMessage(error) {
  const detail = error?.response?.data?.detail;


  if (typeof detail === "string") {
    return detail;
  }


  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item?.msg === "string"
          ? item.msg
          : "Invalid upload request."
      )
      .join(" ");
  }


  if (error?.code === "ECONNABORTED") {
    return (
      "Prediction timed out. The server may still be processing " +
      "the image; check the backend terminal before retrying."
    );
  }


  if (error?.response?.status) {
    return `Prediction request failed (${error.response.status}).`;
  }


  return error?.message || "Image prediction failed.";
}


function Field({ label, children }) {
  return (
    <label className="block text-xs font-medium text-slate-400">
      {label}
      {children}
    </label>
  );
}


export default function SpillAnalysis() {
  const navigate = useNavigate();


  const [form, setForm] = useState(readSavedForm);
  const [storageError, setStorageError] = useState("");
  const [error, setError] = useState("");


  const [file, setFile] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState("");


  const fileInputRef = useRef(null);
  const requestIdRef = useRef(0);
  const requestBusyRef = useRef(false);


  useEffect(() => {
    setStorageError(
      saveForm(form)
        ? ""
        : "Browser session storage is unavailable. These inputs may be lost on reload."
    );
  }, [form]);


  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);


  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setError("");
  }


  function chooseFile(event) {
    const selected = event.target.files?.[0] || null;


    setPrediction(null);
    setPredictionError("");
    setError("");


    if (selected && selected.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      event.target.value = "";
      setPredictionError("Maximum image size is 15 MiB.");
      return;
    }


    if (selected && selected.size === 0) {
      setFile(null);
      event.target.value = "";
      setPredictionError("The selected file is empty.");
      return;
    }


    setFile(selected);
  }


  async function analyzeImage() {
    if (requestBusyRef.current) return;


    if (!file) {
      setPredictionError("Choose an image first.");
      return;
    }


    requestBusyRef.current = true;
    const requestId = ++requestIdRef.current;


    setPredictionLoading(true);
    setPrediction(null);
    setPredictionError("");
    setError("");


    try {
      const data = await predictSpill(file);


      if (requestId !== requestIdRef.current) return;


      if (
        !data ||
        typeof data !== "object" ||
        typeof data.has_spill !== "boolean"
      ) {
        throw new Error(
          "The prediction API did not return a boolean has_spill field."
        );
      }


      setPrediction(data);
      saveManualPrediction(data, file.name);
    } catch (requestError) {
      if (requestId === requestIdRef.current) {
        setPredictionError(
          predictionErrorMessage(requestError)
        );
      }
    } finally {
      requestBusyRef.current = false;


      if (requestId === requestIdRef.current) {
        setPredictionLoading(false);
      }
    }
  }


  function goToScreening() {
    if (predictionLoading || prediction?.has_spill !== true) {
      setError(
        "Analyze an image first. Vessel screening is enabled only after a positive model prediction."
      );
      return;
    }


    const validationError = validateObservation(form);


    if (validationError) {
      setError(validationError);
      return;
    }


    saveForm(form);


    const params = new URLSearchParams({
      latitude: String(Number(form.latitude)),
      longitude: String(Number(form.longitude)),
      observed_at: new Date(
        form.observedAt.trim()
      ).toISOString(),
      lookback_hours: String(Number(form.lookbackHours)),
      radius_km: String(Number(form.radiusKm)),
      artificial_test: form.artificialTest ? "1" : "0",
    });


    navigate(`/vessel-attribution?${params.toString()}`);
  }


  function clearInvestigation() {
    setForm({ ...EMPTY_FORM });
    setFile(null);
    setPrediction(null);
    setPredictionError("");
    setError("");


    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }


  const warnings = Array.isArray(prediction?.warnings)
    ? prediction.warnings.filter(
        (warning) => typeof warning === "string"
      )
    : [];


  const regions = Array.isArray(prediction?.regions)
    ? prediction.regions
    : [];


  const canScreen =
    !predictionLoading && prediction?.has_spill === true;


  return (
    <main className="min-h-screen space-y-6 bg-[#020617] p-4 text-slate-100 md:p-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-400">
            <Droplets size={16} />
            Spill analysis
          </div>


          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-300"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>
        </div>


        <h1 className="mt-3 text-3xl font-bold">
          Analyze an image and record an observation
        </h1>


        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Upload an image for model prediction, enter the observed
          location and time, then screen saved AIS positions if
          oil-like pixels are predicted.
        </p>
      </header>


      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-200">
        Image prediction, observation metadata, and AIS screening
        are separate steps. This workflow does not calculate drift
        or determine responsibility. AIS proximity is a screening
        lead, not proof that a vessel caused a spill.
      </section>


      {form.artificialTest && (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm font-semibold text-amber-200">
          ARTIFICIAL TEST INVESTIGATION — observation metadata is
          marked as artificial. Predictions and subsequent
          screening must not be presented as a verified spill
          investigation.
        </section>
      )}


      <section className={PANEL}>
        <h2 className="text-xl font-semibold">
          1. Upload and analyze an image
        </h2>


        <p className="mt-2 text-sm leading-6 text-slate-400">
          Choose an image the backend can decode, up to 15 MiB.
          The server makes the final format-validation decision.
        </p>


        <Field label="Image file">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            disabled={predictionLoading}
            onChange={chooseFile}
            className={INPUT}
          />
        </Field>


        {file && (
          <p className="mt-3 break-all text-xs text-slate-400">
            Selected: {file.name} ·{" "}
            {(file.size / (1024 * 1024)).toFixed(2)} MiB
          </p>
        )}


        <button
          type="button"
          disabled={!file || predictionLoading}
          onClick={analyzeImage}
          className="mt-4 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {predictionLoading
            ? "Analyzing image…"
            : "Analyze image"}
        </button>


        <p className="mt-3 text-xs leading-5 text-slate-500">
          The latest prediction is shared with this browser
          session’s Dashboard. The selected image and prediction
          images are not saved.
        </p>


        {predictionError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300"
          >
            {predictionError}
          </div>
        )}


        {prediction && (
          <div className="mt-6 space-y-5">
            <div
              role="status"
              className={`rounded-xl border p-4 text-sm ${
                prediction.has_spill
                  ? "border-amber-400/20 bg-amber-400/5 text-amber-200"
                  : "border-slate-400/20 bg-slate-400/5 text-slate-200"
              }`}
            >
              <p className="font-semibold">
                {prediction.has_spill
                  ? "Oil-like pixels predicted"
                  : "No oil-like pixels predicted"}
              </p>


              <p className="mt-2 leading-6">
                {prediction.has_spill
                  ? "The endpoint flags a positive result when any mask pixel is positive. It applies no minimum-area filter. This is not independent verification of an oil spill."
                  : "This is a model result, not proof that no spill exists. Vessel screening is not enabled by this result."}
              </p>


              {form.artificialTest && (
                <p className="mt-2 font-semibold">
                  ARTIFICIAL TEST — not a verified investigation.
                </p>
              )}
            </div>


            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Model", prediction.model || "Unavailable"],
                [
                  "Predicted image coverage",
                  formatPercentage(
                    prediction.oil_pixel_fraction,
                    3
                  ),
                ],
                [
                  "Connected regions",
                  formatNumber(prediction.region_count, 0),
                ],
                [
                  "Pixel threshold",
                  formatNumber(prediction.threshold, 2),
                ],
                [
                  "Alert severity",
                  prediction.alert?.alert_level ||
                    "Unavailable",
                ],
                [
                  "Largest-region mean model probability",
                  prediction.confidence_available === true
                    ? formatPercentage(
                        prediction.alert?.largest_region
                          ?.mean_probability,
                        1
                      )
                    : "Unavailable",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl bg-white/5 p-4"
                >
                  <dt className="text-xs text-slate-400">
                    {label}
                  </dt>
                  <dd className="mt-2 text-sm font-semibold">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>


            <p className="text-xs leading-5 text-slate-400">
              Coverage is a fraction of image pixels, not a
              measured spill area in square kilometres. Model
              probabilities are not a verified probability that
              an actual spill exists.
            </p>


            {typeof prediction.alert?.reason === "string" && (
              <p className="text-sm leading-6 text-slate-300">
                {prediction.alert.reason}
              </p>
            )}


            <div className="grid gap-4 lg:grid-cols-3">
              {[
                [
                  "Predicted overlay",
                  prediction.overlay_jpg_base64,
                  "image/jpeg",
                ],
                [
                  "Binary prediction mask",
                  prediction.mask_png_base64,
                  "image/png",
                ],
                [
                  "Model probability heatmap",
                  prediction.probability_jpg_base64,
                  "image/jpeg",
                ],
              ].map(([label, encoded, mime]) =>
                typeof encoded === "string" && encoded ? (
                  <figure
                    key={label}
                    className="overflow-hidden rounded-xl border border-white/10 bg-black/20"
                  >
                    <figcaption className="p-3 text-xs text-slate-300">
                      {label}
                    </figcaption>
                    <img
                      src={`data:${mime};base64,${encoded}`}
                      alt={label}
                      className="h-56 w-full object-contain"
                    />
                  </figure>
                ) : null
              )}
            </div>


            {regions.length > 0 && (
              <details className="rounded-xl border border-white/10 p-4">
                <summary className="cursor-pointer text-sm text-cyan-300">
                  Predicted region details
                </summary>


                <div className="mt-4 max-h-72 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="p-2">Region</th>
                        <th className="p-2">Pixels</th>
                        <th className="p-2">
                          Mean model probability
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {regions.map((region, index) => (
                        <tr
                          key={region.region_id ?? index}
                          className="border-t border-white/10"
                        >
                          <td className="p-2">
                            {region.region_id ?? "Unavailable"}
                          </td>
                          <td className="p-2">
                            {formatNumber(
                              region.pixel_count,
                              0
                            )}
                          </td>
                          <td className="p-2">
                            {formatPercentage(
                              region.mean_probability,
                              1
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}


            {warnings.length > 0 && (
              <div className="rounded-xl border border-amber-400/20 p-4 text-sm text-amber-200">
                <p className="font-semibold">
                  Backend warnings
                </p>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  {warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>


      <section className={PANEL}>
        <h2 className="text-xl font-semibold">
          2. Record observation details
        </h2>


        <p className="mt-2 text-sm leading-6 text-slate-400">
          Enter the actual observation location and time.
          Upload time and image processing time are not used as
          the observation timestamp. Coordinates are supplied
          by you, not inferred from the uploaded image.
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
              onChange={(event) =>
                update("latitude", event.target.value)
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
              onChange={(event) =>
                update("longitude", event.target.value)
              }
              className={INPUT}
            />
          </Field>


          <Field label="Observation timestamp with timezone">
            <input
              type="text"
              placeholder="YYYY-MM-DDTHH:mm:ssZ"
              value={form.observedAt}
              onChange={(event) =>
                update("observedAt", event.target.value)
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
              onChange={(event) =>
                update(
                  "lookbackHours",
                  event.target.value
                )
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
              onChange={(event) =>
                update("radiusKm", event.target.value)
              }
              className={INPUT}
            />
          </Field>
        </div>


        <label className="mt-5 flex items-start gap-3 text-sm text-amber-200">
          <input
            type="checkbox"
            checked={form.artificialTest}
            onChange={(event) =>
              update(
                "artificialTest",
                event.target.checked
              )
            }
            className="mt-1"
          />
          This investigation uses artificial test metadata,
          not a verified spill observation.
        </label>


        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setForm({ ...TEST_FORM });
              setError("");
            }}
            className="rounded-xl border border-white/15 px-5 py-3 text-sm"
          >
            Load artificial observation metadata
          </button>


          <button
            type="button"
            disabled={predictionLoading}
            onClick={clearInvestigation}
            className="rounded-xl border border-white/15 px-5 py-3 text-sm text-slate-400 disabled:opacity-50"
          >
            Clear image, prediction, and metadata
          </button>
        </div>


        <p className="mt-3 text-xs leading-5 text-slate-500">
          Loading artificial metadata does not generate a test
          image or create AIS records. It does not guarantee
          matching vessels.
        </p>


        {storageError && (
          <p
            role="alert"
            className="mt-4 text-sm text-amber-300"
          >
            {storageError}
          </p>
        )}
      </section>


      <section className={PANEL}>
        <h2 className="text-xl font-semibold">
          3. Continue to AIS screening
        </h2>


        <p className="mt-2 text-sm leading-6 text-slate-400">
          After a positive image prediction, pass your
          observation details to Vessel Attribution. Run its
          screening query to rank matching vessels by nearest
          recorded position; time difference breaks distance
          ties.
        </p>


        <button
          type="button"
          disabled={!canScreen}
          onClick={goToScreening}
          className="mt-5 flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Search size={16} />
          Continue to vessel screening
        </button>


        {!canScreen && (
          <p className="mt-3 text-xs text-slate-400">
            Analyze an image with a positive prediction to
            enable this step.
          </p>
        )}


        <p className="mt-3 text-xs leading-5 text-amber-200">
          This button does not assign responsibility. AIS
          coverage can be incomplete, and missing matches do
          not establish that no vessel was present.
        </p>


        {error && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300"
          >
            <AlertTriangle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </section>
    </main>
  );
}