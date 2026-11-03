import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";


import {
  Activity,
  AlertTriangle,
  Gauge,
  Layers,
  Radar,
  ScanLine,
  Satellite,
  Target,
  TrendingUp,
} from "lucide-react";


import StatCard from "../Components/StatCard";
import SpillCard from "../Components/SpillCard";
import RiskBadge from "../Components/RiskBadge";


import { getLiveResults } from "../Services/api";


const MANUAL_PREDICTION_KEY =
  "oiltrace.latest-manual-prediction.v1";


function readManualPrediction() {
  try {
    const saved = JSON.parse(
      window.sessionStorage.getItem(
        MANUAL_PREDICTION_KEY
      ) || "null"
    );


    if (!saved || typeof saved !== "object") {
      return null;
    }


    if (typeof saved.has_spill !== "boolean") {
      return null;
    }


    return saved;
  } catch {
    return null;
  }
}


export default function Dashboard() {
  const navigate = useNavigate();


  const [liveResults, setLiveResults] = useState([]);
  const [manualPrediction, setManualPrediction] = useState(
    readManualPrediction
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  useEffect(() => {
    let cancelled = false;


    const loadLiveResults = async () => {
      try {
        const data = await getLiveResults(10);


        if (cancelled) return;


        setLiveResults(
          Array.isArray(data?.results) ? data.results : []
        );
        setError("");
      } catch (requestError) {
        console.error(
          "Live results API error:",
          requestError
        );


        if (!cancelled) {
          setError(
            "Live detection results could not be loaded."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };


    loadLiveResults();


    const interval = setInterval(
      loadLiveResults,
      10000
    );


    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);


  useEffect(() => {
    const checkManualPrediction = () => {
      setManualPrediction(readManualPrediction());
    };


    checkManualPrediction();


    window.addEventListener(
      "focus",
      checkManualPrediction
    );


    return () => {
      window.removeEventListener(
        "focus",
        checkManualPrediction
      );
    };
  }, []);


  const allResults = useMemo(() => {
    const results = [...liveResults];


    if (manualPrediction) {
      results.unshift(manualPrediction);
    }


    return results;
  }, [liveResults, manualPrediction]);


  const latestResult = allResults[0] || null;


  const spillCount = useMemo(
    () =>
      allResults.filter(
        (result) => result.has_spill
      ).length,
    [allResults]
  );


  const highAlertCount = useMemo(
    () =>
      allResults.filter(
        (result) =>
          result.alert?.alert_level
            ?.toUpperCase() === "HIGH"
      ).length,
    [allResults]
  );


  const latestConfidence =
    latestResult?.alert?.largest_region
      ?.mean_probability != null
      ? `${(
          latestResult.alert.largest_region
            .mean_probability * 100
        ).toFixed(1)}%`
      : "—";


  const latestCoverage =
    latestResult?.oil_pixel_fraction != null
      ? `${(
          latestResult.oil_pixel_fraction * 100
        ).toFixed(3)}%`
      : "—";


  const latestFileName = latestResult?.image
    ? latestResult.image
        .split("\\")
        .pop()
        .split("/")
        .pop()
    : "No image";


  const latestTime = latestResult?.processed_at
    ? new Date(
        latestResult.processed_at
      ).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Unavailable";


  const latestAlertLevel =
    latestResult?.alert?.alert_level
      ?.toUpperCase() || "NONE";


  const latestSource =
    latestResult?.source === "manual_upload"
      ? "MANUAL UPLOAD"
      : "LIVE WATCHER";


  const alertStyles = {
    HIGH:
      "border-rose-400/20 bg-rose-500/10 text-rose-300",
    MEDIUM:
      "border-amber-400/20 bg-amber-400/10 text-amber-300",
    LOW:
      "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    NONE:
      "border-slate-700 bg-slate-900 text-slate-400",
  };


  return (
    <div className="page-enter p-4 sm:p-6">
      <div className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="status-dot" />
            <span className="text-[9px] font-bold uppercase tracking-[.25em] text-emerald-400">
              OILTRACE Live Network Operational
            </span>
          </div>


          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Maritime
            <span className="gradient-text">
              {" "}
              Command Center
            </span>
          </h1>


          <p className="mt-2 text-xs text-slate-500">
            Live watcher detections and manual image
            prediction results.
          </p>
        </div>


        <button
          type="button"
          className="glow-button flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-bold text-white"
          onClick={() =>
            navigate("/spill-analysis")
          }
        >
          <ScanLine size={15} />
          NEW INVESTIGATION
        </button>
      </div>


      {error && (
        <div className="mb-5 rounded-xl border border-amber-400/10 bg-amber-400/[.04] px-4 py-3 text-xs text-amber-300">
          {error}
        </div>
      )}


      {loading && (
        <div className="mb-5 rounded-xl border border-cyan-400/10 bg-cyan-400/[.03] px-4 py-3 text-xs text-cyan-300">
          Loading live detection intelligence...
        </div>
      )}


      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Spill Detections"
          value={loading ? "…" : spillCount}
          change={`${allResults.length} recent analyses`}
          icon={AlertTriangle}
          color="red"
        />


        <StatCard
          title="High Alerts"
          value={loading ? "…" : highAlertCount}
          change="Requires immediate review"
          icon={Gauge}
          color="violet"
        />


        <StatCard
          title="Latest Confidence"
          value={loading ? "…" : latestConfidence}
          change={`Model: ${
            latestResult?.model || "v2.1"
          }`}
          icon={Target}
          color="cyan"
        />


        <StatCard
          title="Latest Coverage"
          value={loading ? "…" : latestCoverage}
          change={`Source: ${latestFileName}`}
          icon={Layers}
          color="green"
        />
      </div>


      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_.8fr]">
        <div className="glass overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/[.05] px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <Satellite
                  size={16}
                  className="text-cyan-400"
                />
                Latest Detection
              </h2>
              <p className="mt-1 text-[10px] text-slate-600">
                Most recent OILTRACE analysis
              </p>
            </div>


            <div className="flex items-center gap-2">
              <span className="status-dot" />
              <span className="text-[9px] text-emerald-400">
                AUTO REFRESH • 10S
              </span>
            </div>
          </div>


          {latestResult ? (
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">
                    {latestFileName}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {latestTime}
                  </p>
                </div>


                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-cyan-400/20 px-3 py-1 text-[10px] font-bold uppercase text-cyan-300">
                    {latestSource}
                  </span>


                  <span
                    className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase ${
                      alertStyles[
                        latestAlertLevel
                      ] || alertStyles.NONE
                    }`}
                  >
                    {latestAlertLevel}
                  </span>
                </div>
              </div>


              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-white/[.05] bg-white/[.02] p-4">
                  <p className="text-[9px] uppercase tracking-widest text-slate-600">
                    Oil-like pixels predicted
                  </p>
                  <p className="mt-2 text-lg font-black text-white">
                    {latestResult.has_spill
                      ? "Yes"
                      : "No"}
                  </p>
                </div>


                <div className="rounded-xl border border-white/[.05] bg-white/[.02] p-4">
                  <p className="text-[9px] uppercase tracking-widest text-slate-600">
                    Regions
                  </p>
                  <p className="mt-2 text-lg font-black text-white">
                    {Array.isArray(
                      latestResult.regions
                    )
                      ? latestResult.regions.length
                      : 0}
                  </p>
                </div>


                <div className="rounded-xl border border-white/[.05] bg-white/[.02] p-4">
                  <p className="text-[9px] uppercase tracking-widest text-slate-600">
                    Coverage
                  </p>
                  <p className="mt-2 text-lg font-black text-white">
                    {latestCoverage}
                  </p>
                </div>
              </div>


              <p className="mt-5 text-xs leading-6 text-slate-400">
                {latestResult.alert?.reason ||
                  "No alert information available."}
              </p>


              <p className="mt-3 text-xs leading-5 text-amber-200">
                This is a model result, not independent
                verification of an oil spill.
              </p>
            </div>
          ) : (
            <div className="p-5 text-xs text-slate-500">
              {loading
                ? "Loading latest detection..."
                : "No detection results available yet."}
            </div>
          )}
        </div>


        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">
                Intelligence Radar
              </h2>
              <p className="mt-1 text-[10px] text-slate-600">
                Detection activity monitor
              </p>
            </div>
            <Radar
              size={18}
              className="text-cyan-400"
            />
          </div>


          <div className="mt-8 flex justify-center">
            <div className="radar h-64 w-64">
              <div className="radar-sweep" />


              <span
                className="radar-point"
                style={{
                  top: "25%",
                  left: "65%",
                }}
              />
              <span
                className="radar-point"
                style={{
                  top: "55%",
                  left: "35%",
                }}
              />
              <span
                className="radar-point"
                style={{
                  top: "68%",
                  left: "67%",
                }}
              />


              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
                  <Activity
                    size={18}
                    className="text-cyan-400"
                  />
                </div>
              </div>
            </div>
          </div>


          <div className="mt-7 grid grid-cols-2 gap-3">
            <RadarStat
              label="Analyses"
              value={allResults.length}
            />
            <RadarStat
              label="Spills"
              value={spillCount}
            />
            <RadarStat
              label="High Alerts"
              value={highAlertCount}
            />
            <RadarStat
              label="Latest"
              value={latestAlertLevel}
            />
          </div>
        </div>
      </div>


      <div className="mt-5 glass rounded-2xl p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <ScanLine
                size={16}
                className="text-cyan-400"
              />
              OILTRACE Detections
            </h2>
            <p className="mt-1 text-[10px] text-slate-600">
              Live watcher results and manual upload
              predictions
            </p>
          </div>
        </div>


        {allResults.length === 0 ? (
          <div className="mt-5 rounded-xl border border-white/[.05] bg-white/[.02] p-5 text-xs text-slate-500">
            {loading
              ? "Loading detections..."
              : "No detection results available yet."}
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {allResults.map((result, index) => {
              const alertLevel =
                result.alert?.alert_level
                  ?.toUpperCase() || "NONE";


              const regionCount = Array.isArray(
                result.regions
              )
                ? result.regions.length
                : 0;


              const confidence =
                result.alert?.largest_region
                  ?.mean_probability != null
                  ? `${(
                      result.alert.largest_region
                        .mean_probability * 100
                    ).toFixed(1)}%`
                  : "—";


              const fileName = result.image
                ? result.image
                    .split("\\")
                    .pop()
                    .split("/")
                    .pop()
                : "Uploaded image";


              const source =
                result.source === "manual_upload"
                  ? "MANUAL UPLOAD"
                  : "LIVE WATCHER";


              return (
                <div
                  key={
                    result.result_id ||
                    `manual-${index}`
                  }
                  className="rounded-2xl border border-white/[.05] bg-white/[.02] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">
                        {fileName}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {result.processed_at
                          ? new Date(
                              result.processed_at
                            ).toLocaleString(
                              "en-IN",
                              {
                                dateStyle:
                                  "medium",
                                timeStyle:
                                  "short",
                              }
                            )
                          : "Unavailable"}
                      </p>
                    </div>


                    <span className="shrink-0 rounded-full border border-cyan-400/20 px-2 py-1 text-[8px] font-bold uppercase text-cyan-300">
                      {source}
                    </span>
                  </div>


                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-white/[.05] bg-white/[.02] p-2">
                      <p className="text-[8px] uppercase text-slate-600">
                        Oil-like pixels
                      </p>
                      <p className="mt-1 text-xs font-bold text-white">
                        {result.has_spill
                          ? "Yes"
                          : "No"}
                      </p>
                    </div>


                    <div className="rounded-lg border border-white/[.05] bg-white/[.02] p-2">
                      <p className="text-[8px] uppercase text-slate-600">
                        Regions
                      </p>
                      <p className="mt-1 text-xs font-bold text-white">
                        {regionCount}
                      </p>
                    </div>


                    <div className="rounded-lg border border-white/[.05] bg-white/[.02] p-2">
                      <p className="text-[8px] uppercase text-slate-600">
                        Confidence
                      </p>
                      <p className="mt-1 text-xs font-bold text-white">
                        {confidence}
                      </p>
                    </div>
                  </div>


                  <p className="mt-3 text-[10px] leading-5 text-slate-500">
                    {result.alert?.reason ||
                      "No alert information available."}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>


      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">
              Current Detection
            </h2>
            <p className="mt-1 text-[10px] text-slate-600">
              Latest OILTRACE result
            </p>
          </div>
          <TrendingUp
            size={17}
            className="text-cyan-400"
          />
        </div>


        <div className="space-y-3">
          {latestResult ? (
            <SpillCard
              spill={{
                id:
                  latestResult.result_id ||
                  "manual-latest",
                location: latestFileName,
                area: latestCoverage,
                confidence: latestConfidence,
                detectedAt: latestTime,
                risk: latestAlertLevel,
                status: latestResult.has_spill
                  ? "Model alert"
                  : "No model alert",
              }}
            />
          ) : (
            <div className="glass rounded-xl p-5 text-xs text-slate-500">
              No detection available.
            </div>
          )}
        </div>
      </div>


      <div className="mt-5 critical rounded-2xl border border-rose-400/10 bg-rose-500/[.03] p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
            <AlertTriangle size={18} />
          </div>


          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-rose-400">
              Priority Alert
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              {latestResult?.has_spill
                ? `${latestAlertLevel} oil-like pixel alert`
                : "No active model alert"}
            </p>
          </div>
        </div>


        <p className="mt-5 text-xs leading-6 text-slate-500">
          {latestResult?.has_spill
            ? latestResult.alert?.reason ||
              "Oil-like pixels were predicted in the latest image."
            : "No oil-like pixels were predicted in the latest available result."}
        </p>


        <p className="mt-3 text-xs leading-6 text-amber-200">
          Model predictions are screening signals, not
          verified spill confirmations or responsibility
          determinations.
        </p>


        <div className="mt-5">
          <RiskBadge risk={latestAlertLevel} />
        </div>
      </div>
    </div>
  );
}


function RadarStat({ label, value }) {
  return (
    <div className="rounded-xl border border-white/[.05] bg-white/[.02] p-3">
      <p className="text-[8px] uppercase tracking-widest text-slate-600">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-white">
        {value}
      </p>
    </div>
  );
}