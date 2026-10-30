import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Satellite,
  Target,
  Layers,
  ScanLine,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  MapPin,
} from "lucide-react";


function readInspection() {
  try {
    const stored = localStorage.getItem(
      "oiltrace_latest_analysis"
    );

    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}


function probabilityPercent(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    return "Unavailable";
  }

  return `${(value * 100).toFixed(1)}%`;
}


function Metric({ icon: Icon, label, value, description }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="inline-flex rounded-xl bg-cyan-400/10 p-2 text-cyan-300">
        <Icon size={19} />
      </div>

      <p className="mt-4 text-xs uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p className="mt-2 break-words text-2xl font-bold text-white">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}


export default function SpillAnalysis() {
  const navigate = useNavigate();
  const [inspection] = useState(readInspection);
  const [activeView, setActiveView] = useState("overlay");

  const analysis = inspection?.analysis ?? null;

  const regionsAvailable = Array.isArray(analysis?.regions);
  const regions = regionsAvailable ? analysis.regions : [];

  const hasSpill = analysis?.spillDetected === true;

  const largestRegion = regions.reduce(
    (largest, region) =>
      !largest ||
      Number(region.pixel_count) > Number(largest.pixel_count)
        ? region
        : largest,
    null
  );

  const confidence = probabilityPercent(
    largestRegion?.mean_probability
  );

  const coverage =
    typeof analysis?.spillAreaPct === "number" &&
    Number.isFinite(analysis.spillAreaPct)
      ? `${analysis.spillAreaPct.toFixed(3)}%`
      : "Unavailable";

  // Use the backend alert, not the old UI's default LOW severity.
  const alertLevel =
    typeof analysis?.alert?.alert_level === "string"
      ? analysis.alert.alert_level.toUpperCase()
      : "UNAVAILABLE";

  const alertReason =
    analysis?.alert?.reason ||
    "Alert metadata was not included in this saved result.";

  const images = {
    original: inspection?.imageDataUrl || null,
    overlay: analysis?.overlayJpgBase64
      ? `data:image/jpeg;base64,${analysis.overlayJpgBase64}`
      : null,
    probability: analysis?.probabilityJpgBase64
      ? `data:image/jpeg;base64,${analysis.probabilityJpgBase64}`
      : null,
    mask: analysis?.maskPngBase64
      ? `data:image/png;base64,${analysis.maskPngBase64}`
      : null,
  };

  const selectedImage = images[activeView];

  const inconsistentRegions =
    hasSpill && regionsAvailable && regions.length === 0;

  const alertClasses = {
    HIGH: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    MEDIUM: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    LOW: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
    NONE: "border-slate-600 bg-slate-800/50 text-slate-300",
    UNASSESSED:
      "border-amber-400/30 bg-amber-400/10 text-amber-300",
    UNAVAILABLE:
      "border-slate-600 bg-slate-800/50 text-slate-300",
  };

  let detectionLabel = "No saved analysis";

  if (analysis) {
    if (!hasSpill) {
      detectionLabel = "No oil-like pixels detected";
    } else if (!regionsAvailable) {
      detectionLabel = "Oil-like pixels detected • regions unavailable";
    } else if (regions.length === 0) {
      detectionLabel =
        "Oil-like pixels detected • region metadata missing or inconsistent";
    } else {
      detectionLabel =
        `Oil-like pixels detected • ${regions.length} region` +
        (regions.length === 1 ? "" : "s");
    }
  }

  if (!analysis) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-8 text-slate-200">
        <h1 className="text-2xl font-bold">No analysis available</h1>

        <p className="mt-3 text-sm text-slate-400">
          Upload an image through New Analysis to generate a result.
        </p>

        <button
          type="button"
          onClick={() => navigate("/analysis/new")}
          className="mt-6 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950"
        >
          New Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-100">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-300">
            <Satellite size={16} />
            Satellite Investigation
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold md:text-4xl">
              Spill Analysis
            </h1>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                alertClasses[alertLevel] || alertClasses.UNAVAILABLE
              }`}
            >
              Alert: {alertLevel}
            </span>
          </div>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            {alertReason}
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/analysis/new")}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm"
        >
          Analyze Another Image
          <ArrowRight size={16} />
        </button>
      </header>

      {inconsistentRegions && (
        <div className="flex gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
          <AlertTriangle
            size={20}
            className="shrink-0 text-amber-300"
          />

          <p className="text-sm leading-6 text-amber-200">
            This saved result contains detected pixels but no region
            metadata. Upload the image again after restarting the
            updated backend. The missing metrics are not evidence
            that the model detected nothing.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.7fr]">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 p-5">
            <h2 className="font-semibold">
              Detection Visualization
            </h2>

            <div className="flex flex-wrap gap-2">
              {[
                ["original", "Original"],
                ["overlay", "Overlay"],
                ["probability", "Probability"],
                ["mask", "Mask"],
              ].map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  disabled={!images[view]}
                  onClick={() => setActiveView(view)}
                  className={`rounded-lg border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-30 ${
                    activeView === view
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                      : "border-white/10 text-slate-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-white/10 px-5 py-3 text-sm text-cyan-300">
            {detectionLabel}
          </div>

          <div className="flex min-h-[420px] items-center justify-center bg-[#06131d] p-2">
            {selectedImage ? (
              <img
                src={selectedImage}
                alt={`OILTRACE ${activeView} visualization`}
                className="max-h-[700px] w-full object-contain"
              />
            ) : (
              <p className="text-sm text-slate-500">
                This view is unavailable for the saved result.
              </p>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <Metric
            icon={ScanLine}
            label="Oil Coverage"
            value={coverage}
            description="Percentage of prediction-mask pixels classified as oil-like."
          />

          <Metric
            icon={Target}
            label="Largest Region Mean Probability"
            value={confidence}
            description="Mean raw model probability within the largest connected region. This is not a verified accuracy score."
          />

          <Metric
            icon={Layers}
            label="Candidate Regions"
            value={
              inconsistentRegions || !regionsAvailable
                ? "Unavailable"
                : regions.length
            }
            description="Connected foreground regions reported by the backend."
          />

          <Metric
            icon={MapPin}
            label="Location"
            value={inspection.location || "Not provided"}
            description="User-entered context; not inferred geographic coordinates."
          />
        </aside>
      </div>

      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Layers size={19} className="text-cyan-300" />
          Region Details
        </h2>

        {regions.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {regions.map((region, index) => (
              <article
                key={region.region_id ?? index}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <h3 className="font-semibold text-cyan-300">
                  Region {region.region_id ?? index + 1}
                </h3>

                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Area</dt>
                    <dd>{region.pixel_count ?? "Unavailable"} pixels</dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">
                      Mean probability
                    </dt>
                    <dd>
                      {probabilityPercent(region.mean_probability)}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">
                      Maximum probability
                    </dt>
                    <dd>
                      {probabilityPercent(region.max_probability)}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">Bounding box</dt>
                    <dd>
                      {region.bbox
                        ? `${region.bbox.width} × ${region.bbox.height} px`
                        : "Unavailable"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">
                      Centroid in mask coordinates
                    </dt>
                    <dd>
                      {typeof region.centroid?.x === "number" &&
                      typeof region.centroid?.y === "number"
                        ? `${region.centroid.x.toFixed(1)}, ${region.centroid.y.toFixed(1)}`
                        : "Unavailable"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            {hasSpill
              ? "Region metadata is unavailable for this saved result."
              : "No foreground regions were reported."}
          </p>
        )}
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-5">
        <CheckCircle2
          size={20}
          className="shrink-0 text-cyan-300"
        />

        <p className="text-sm leading-6 text-slate-400">
          These outputs describe the model prediction, not confirmed
          oil contamination. Physical area, geographic coordinates,
          spill age, drift, and vessel responsibility are not
          established by this image-only result.
        </p>
      </div>
    </div>
  );
}