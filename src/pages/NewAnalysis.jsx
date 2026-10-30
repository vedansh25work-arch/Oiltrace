import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Satellite,
  MapPin,
  FileText,
  Zap,
  Image as ImageIcon,
  X,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";
import UploadBox from "../Components/UploadBox";
import { predictSpill } from "../Services/api";


const NewAnalysis = () => {
  const navigate = useNavigate();


  const [files, setFiles] = useState([]);
  const [category, setCategory] = useState("Auto Detect");
  const [location, setLocation] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);


  const handleFiles = (selectedFiles) => {
    const incoming = Array.from(selectedFiles || []);


    const valid = incoming.filter((file) =>
      [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ].includes(file.type)
    );


    setFiles(valid);
    setError(null);
  };


  const removeFile = (index) => {
    setFiles((prev) =>
      prev.filter((_, fileIndex) => fileIndex !== index)
    );
  };


  const startAnalysis = async () => {
    if (files.length === 0) {
      return;
    }


    setLoading(true);
    setError(null);


    const firstFile = files[0];


    try {
      const result = await predictSpill(firstFile);


      const imageDataUrl = await new Promise(
        (resolve, reject) => {
          const reader = new FileReader();


          reader.onload = () => resolve(reader.result);
          reader.onerror = () =>
            reject(new Error("Could not read selected image."));
          reader.readAsDataURL(firstFile);
        }
      );


      const hasSpill = Boolean(result.has_spill);
      const alertLevel =
        result.alert?.alert_level?.toUpperCase() || "NONE";


      const regions = Array.isArray(result.regions)
        ? result.regions
        : [];


      const largestRegion =
        result.alert?.largest_region ||
        regions.reduce(
          (largest, region) =>
            !largest ||
            region.pixel_count > largest.pixel_count
              ? region
              : largest,
          null
        );


      const confidence = largestRegion
        ? Number(
            (
              largestRegion.mean_probability * 100
            ).toFixed(1)
          )
        : 0;


      const severity =
        alertLevel === "HIGH"
          ? "HIGH"
          : alertLevel === "MEDIUM"
            ? "MEDIUM"
            : hasSpill
              ? "LOW"
              : "NONE";


      const analysis = {
        spillDetected: hasSpill,
        sensorType: "OILTRACE Detection Model",
        model: result.model || "v2.1",
        threshold: result.threshold,
        spillAreaPct: Number(
          ((result.oil_pixel_fraction || 0) * 100).toFixed(3)
        ),
        oilPixelCount: result.oil_pixel_count || 0,
        estimatedAreaKm2: null,
        perimeterKm: null,
        confidence,
        severity,
        shape:
          regions.length > 1
            ? `${regions.length} candidate regions`
            : regions.length === 1
              ? "Single candidate region"
              : "No candidate region",
        latitude: null,
        longitude: null,
        center: null,
        bbox: null,
        regions,
        largestRegion,
        alert: result.alert || null,
        overlayJpgBase64:
          result.overlay_jpg_base64 || null,
        probabilityJpgBase64:
          result.probability_jpg_base64 || null,
        maskPngBase64: result.mask_png_base64 || null,
      };


      const inspection = {
        id: `OT-${Date.now()}`,
        category,
        location:
          location ||
          (hasSpill
            ? "Detected spill region"
            : "No spill detected"),
        remarks,
        images: files.map((file) => file.name),
        imageDataUrl,
        analysis,
        createdAt: new Date().toISOString(),
        status: "Completed",
        source: "api",
      };


      localStorage.setItem(
        "oiltrace_latest_analysis",
        JSON.stringify(inspection)
      );


      navigate("/analysis/spill");
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          requestError.message ||
          "Could not analyze the uploaded image."
      );
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="ot-page-enter space-y-8">
      {/* HERO */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-cyan-400/10 bg-slate-950/70 p-7 backdrop-blur-xl"
      >
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />


        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300">
                <Satellite size={24} />
              </div>


              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-xs font-semibold tracking-widest text-cyan-300">
                ANALYSIS ENGINE
              </span>
            </div>


            <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
              New{" "}
              <span className="ot-gradient-text">
                Oil Spill Analysis
              </span>
            </h1>


            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Upload satellite imagery and let OILTRACE detect,
              characterize, track and correlate the suspected
              maritime spill.
            </p>
          </div>


          <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-400/5 px-4 py-3">
            <div className="ot-status-dot" />
            <div>
              <p className="text-xs font-bold text-emerald-300">
                AI ENGINE READY
              </p>
              <p className="text-[11px] text-slate-500">
                Detection pipeline online
              </p>
            </div>
          </div>
        </div>
      </motion.div>


      {/* ERROR */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
          <AlertTriangle
            size={18}
            className="mt-0.5 text-rose-400"
          />


          <div>
            <p className="text-sm font-semibold text-rose-200">
              Analysis failed
            </p>
            <p className="mt-1 text-xs text-rose-300/80">
              {error}
            </p>
          </div>
        </div>
      )}


      {/* MAIN GRID */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        {/* UPLOAD */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="ot-card p-6"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <ImageIcon
                  size={19}
                  className="text-cyan-300"
                />
                Satellite Imagery
              </h2>


              <p className="mt-1 text-xs text-slate-500">
                Upload a satellite capture for OILTRACE
                detection.
              </p>
            </div>


            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[10px] text-slate-400">
              JPG • PNG • WEBP
            </span>
          </div>


          <UploadBox
            onFilesSelected={handleFiles}
            multiple={true}
            maxFiles={4}
          />


          {files.length > 0 && (
            <div className="mt-5 space-y-3">
              {files.map((file, index) => (
                <motion.div
                  key={`${file.name}-${index}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between rounded-xl border border-cyan-400/10 bg-slate-900/70 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-lg bg-cyan-400/10 p-2 text-cyan-300">
                      <ImageIcon size={17} />
                    </div>


                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {file.name}
                      </p>


                      <p className="text-[10px] text-slate-500">
                        {(file.size / 1024 / 1024).toFixed(2)}{" "}
                        MB
                      </p>
                    </div>
                  </div>


                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>


        {/* CONFIGURATION */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="ot-card p-6"
        >
          <div className="mb-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <Zap size={19} className="text-violet-300" />
              Analysis Parameters
            </h2>


            <p className="mt-1 text-xs text-slate-500">
              Optional information improves investigation
              context.
            </p>
          </div>


          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Classification
              </label>


              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value)
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-200 transition focus:border-cyan-400/40"
              >
                <option>Auto Detect</option>
                <option>Crude Oil</option>
                <option>Fuel / Diesel</option>
                <option>Industrial Oil</option>
                <option>Unknown Hydrocarbon</option>
              </select>
            </div>


            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Location
              </label>


              <div className="relative">
                <MapPin
                  size={17}
                  className="absolute left-3 top-3.5 text-slate-500"
                />


                <input
                  value={location}
                  onChange={(event) =>
                    setLocation(event.target.value)
                  }
                  placeholder="e.g. Arabian Sea"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-3 pl-10 pr-4 text-sm text-white transition placeholder:text-slate-600 focus:border-cyan-400/40"
                />
              </div>
            </div>


            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Investigator Remarks
              </label>


              <div className="relative">
                <FileText
                  size={17}
                  className="absolute left-3 top-3.5 text-slate-500"
                />


                <textarea
                  value={remarks}
                  onChange={(event) =>
                    setRemarks(event.target.value)
                  }
                  rows={5}
                  placeholder="Add any observation or contextual information..."
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900/80 py-3 pl-10 pr-4 text-sm text-white transition placeholder:text-slate-600 focus:border-cyan-400/40"
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>


      {/* PIPELINE */}
      <div className="ot-card p-6">
        <div className="mb-5 flex items-center gap-2">
          <Sparkles size={18} className="text-cyan-300" />
          <h2 className="font-bold text-white">
            Investigation Pipeline
          </h2>
        </div>


        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["01", "Satellite Scan"],
            ["02", "Spill Detection"],
            ["03", "Region Analysis"],
            ["04", "Confidence Scoring"],
            ["05", "Alert Generation"],
          ].map(
            ([number, title], index) => (
              <motion.div
                key={number}
                whileHover={{ y: -4 }}
                className="relative rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <span className="text-xs font-black text-cyan-400">
                  {number}
                </span>


                <p className="mt-2 text-sm font-semibold text-slate-200">
                  {title}
                </p>


                {index < 4 && (
                  <ArrowRight
                    size={14}
                    className="absolute -right-2 top-1/2 hidden text-slate-700 lg:block"
                  />
                )}
              </motion.div>
            )
          )}
        </div>
      </div>


      {/* ACTION */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={startAnalysis}
          disabled={files.length === 0 || loading}
          className="ot-button flex items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Analyzing Image...
            </>
          ) : (
            <>
              <ShieldCheck size={18} />
              Start OILTRACE Analysis
              <ArrowRight size={17} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};


export default NewAnalysis;