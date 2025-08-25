import { useEffect, useState, useRef } from "react";
import exifr from "exifr";

/**
 * Config
 */
const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6 MB
const PREVIEW_SIZE = 400; // preview 400x400
const UPLOAD_SIZE = 800; // server will produce 800x800 but we still preview a processed image client-side
const PREVIEW_QUALITY = 0.7; // for preview webp quality
const UPLOAD_ENDPOINT = "http://localhost:4000/api/uploads";
const RECIPES_ENDPOINT = "http://localhost:4000/api/recipes";

/**
 * Helpers
 */
function mapErrors(errsArray) {
  const out = {};
  if (!Array.isArray(errsArray)) return out;
  for (const e of errsArray) {
    if (!e || !e.field) {
      out._global =
        (out._global ? out._global + "; " : "") +
        (e?.message || JSON.stringify(e));
      continue;
    }
    const f = e.field;
    if (
      f.startsWith("images") ||
      f.match(/^images(\[\d+\])?$/) ||
      f === "file"
    ) {
      out.images = (out.images ? out.images + "; " : "") + e.message;
    } else if (f === "title" || f === "body" || f === "feedback") {
      out[f] = (out[f] ? out[f] + "; " : "") + e.message;
    } else {
      out._global = (out._global ? out._global + "; " : "") + e.message;
    }
  }
  return out;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Rotate/correct based on orientation (exif) by drawing into canvas with transform.
 * We use exifr to read orientation (1..8). If no orientation, treat as 1.
 * Returns a canvas with the oriented image drawn at natural size.
 */
async function drawImageWithExifOrientation(file) {
  // read orientation
  let orientation = 1;
  try {
    const o = await exifr.orientation(file);
    if (o) orientation = o;
  } catch (err) {
    console.warn("exifr failed", err);
  }

  const img = await fileToImage(file);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  // depending on orientation, canvas width/height swap
  const swap = orientation >= 5 && orientation <= 8;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? ih : iw;
  canvas.height = swap ? iw : ih;
  const ctx = canvas.getContext("2d");

  // set transform based on orientation:
  // reference: EXIF orientation values and transforms
  switch (orientation) {
    case 2: // horizontal flip
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      break;
    case 3: // 180°
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(Math.PI);
      break;
    case 4: // vertical flip
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
      break;
    case 5: // transpose
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6: // 90° CW
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -canvas.width);
      break;
    case 7: // transverse
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(canvas.height, -canvas.width);
      ctx.scale(-1, 1);
      break;
    case 8: // 90° CCW
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-canvas.height, 0);
      break;
    // case 1 and default: no transform
    default:
      break;
  }

  // draw image
  ctx.drawImage(img, 0, 0, iw, ih);
  return canvas;
}

/**
 * Given a source canvas (or image element), center-crop to square and resize to targetSize, export webp dataURL
 */
function cropCanvasToWebpDataUrl(
  srcCanvasOrImg,
  targetSize = 800,
  quality = 0.7
) {
  // get source width/height
  const sw = srcCanvasOrImg.width || srcCanvasOrImg.naturalWidth;
  const sh = srcCanvasOrImg.height || srcCanvasOrImg.naturalHeight;
  const sMin = Math.min(sw, sh);
  const sx = Math.floor((sw - sMin) / 2);
  const sy = Math.floor((sh - sMin) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext("2d");

  // draw using drawImage (source can be canvas or image)
  ctx.drawImage(
    srcCanvasOrImg,
    sx,
    sy,
    sMin,
    sMin,
    0,
    0,
    targetSize,
    targetSize
  );

  // export as WebP
  // Note: canvas.toDataURL('image/webp') may not be supported in older Safari; if you need fallback use 'image/jpeg'
  const mime = "image/webp";
  try {
    return canvas.toDataURL(mime, quality);
  } catch (err) {
    // fallback to jpeg
    return canvas.toDataURL("image/jpeg", quality);
  }
}

/**
 * Upload original file (multipart/form-data) to backend /api/uploads
 * Returns { url } from backend.
 */
async function uploadFileToServer(file) {
  const fd = new FormData();
  fd.append("file", file, file.name);
  const res = await fetch(UPLOAD_ENDPOINT, { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      (body && body.errors && body.errors.map((e) => e.message).join("; ")) ||
        res.statusText
    );
  }
  return res.json();
}

/**
 * Component
 */
export default function App() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // form state for creating a recipe
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState("");

  // single file selection for create-recipe
  const [selectedFile, setSelectedFile] = useState(null); // File
  const [previewDataUrl, setPreviewDataUrl] = useState(null); // 400x400 webp data url
  const [uploadPreviewDataUrl, setUploadPreviewDataUrl] = useState(null); // 800x800 webp data url (optional)

  const [formErrors, setFormErrors] = useState({});
  const [processingFiles, setProcessingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef(null);

  // --- New states for attempts support ---
  // expanded: { [recipeId]: { open: bool, loading: bool, attempts: [], error: string|null, choosing: attemptId|null, choosingError: string|null } }
  const [expanded, setExpanded] = useState({});
  // attemptForms: { [recipeId]: { body, feedback, file, previewDataUrl, uploadPreviewDataUrl, processingFiles, submitting, errors } }
  const [attemptForms, setAttemptForms] = useState({});

  // helper to update attemptForms safely (includes feedback default)
  function setAttemptFormState(recipeId, changes) {
    setAttemptForms((prev) => {
      const cur = prev[recipeId] || {
        body: "",
        feedback: "",
        file: null,
        previewDataUrl: null,
        uploadPreviewDataUrl: null,
        processingFiles: false,
        submitting: false,
        errors: {},
      };
      return { ...prev, [recipeId]: { ...cur, ...changes } };
    });
  }

  useEffect(() => {
    const fetchList = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(RECIPES_ENDPOINT);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const errs =
            body && body.errors
              ? body.errors.map((e) => e.message).join("; ")
              : res.statusText;
          throw new Error(`HTTP ${res.status}: ${errs}`);
        }
        const data = await res.json();
        setRecipes(Array.isArray(data.items) ? data.items : data || []);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchList();
  }, []);

  // ---------- existing create-recipe file handlers ----------
  const onFileSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const file = files[0];

    if (!file.type.startsWith("image/")) {
      alert("只支持图片文件");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert(`文件过大，单张最大 ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
      e.target.value = "";
      return;
    }

    setProcessingFiles(true);
    setFormErrors((prev) => ({ ...prev, images: undefined }));
    try {
      // draw with EXIF orientation corrected into a canvas
      const orientedCanvas = await drawImageWithExifOrientation(file);

      // preview 400x400 webp
      const previewData = cropCanvasToWebpDataUrl(
        orientedCanvas,
        PREVIEW_SIZE,
        PREVIEW_QUALITY
      );
      const uploadPreviewData = cropCanvasToWebpDataUrl(
        orientedCanvas,
        UPLOAD_SIZE,
        PREVIEW_QUALITY
      );
      setSelectedFile(file);
      setPreviewDataUrl(previewData);
      setUploadPreviewDataUrl(uploadPreviewData);
    } catch (err) {
      console.error("处理图片失败", err);
      setFormErrors((prev) => ({ ...prev, images: "图片处理失败" }));
      setSelectedFile(null);
      setPreviewDataUrl(null);
      setUploadPreviewDataUrl(null);
    } finally {
      setProcessingFiles(false);
      e.target.value = "";
    }
  };

  const removeImage = () => {
    setSelectedFile(null);
    setPreviewDataUrl(null);
    setUploadPreviewDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors({});

    try {
      let imageUrls = [];

      if (selectedFile) {
        // upload original file to server (server will handle autoRotate + crop + webp conversion)
        try {
          const uploadRes = await uploadFileToServer(selectedFile);
          if (uploadRes && uploadRes.url) {
            imageUrls.push(uploadRes.url);
          } else {
            throw new Error("Upload returned no URL");
          }
        } catch (err) {
          setFormErrors((prev) => ({
            ...prev,
            images: String(err.message || err),
          }));
          setSubmitting(false);
          return;
        }
      }

      // now submit recipe with imageUrls array
      const payload = {
        title: title || undefined,
        body: body || undefined,
        feedback: feedback || undefined,
        images: imageUrls,
      };

      const res = await fetch(RECIPES_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const bodyRes = await res.json().catch(() => null);
      if (!res.ok) {
        const mapped = mapErrors(bodyRes?.errors);
        setFormErrors(mapped);
        setSubmitting(false);
        return;
      }

      // success: append or re-fetch
      if (bodyRes && bodyRes.id) {
        setRecipes((prev) => [bodyRes, ...prev]);
      } else {
        const listRes = await fetch(RECIPES_ENDPOINT);
        const listBody = await listRes.json().catch(() => []);
        setRecipes(
          Array.isArray(listBody.items) ? listBody.items : listBody || []
        );
      }

      // reset form
      setTitle("");
      setBody("");
      setFeedback("");
      removeImage();
      setFormErrors({});
    } catch (err) {
      console.error("submit failed", err);
      setFormErrors({ _global: String(err.message || err) });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- NEW: attempts-related functions ----------
  const toggleExpand = (recipeId) => {
    const cur = expanded[recipeId];
    if (cur && cur.open) {
      // close
      setExpanded((prev) => ({ ...prev, [recipeId]: { ...cur, open: false } }));
      return;
    }
    // open & fetch attempts
    fetchAttempts(recipeId);
  };

  const fetchAttempts = async (recipeId) => {
    setExpanded((prev) => ({
      ...prev,
      [recipeId]: {
        open: true,
        loading: true,
        attempts: [],
        error: null,
        choosing: null,
        choosingError: null,
      },
    }));
    try {
      const res = await fetch(`${RECIPES_ENDPOINT}/${recipeId}/attempts`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const errs =
          body && body.errors
            ? body.errors.map((e) => e.message).join("; ")
            : res.statusText;
        throw new Error(`HTTP ${res.status}: ${errs}`);
      }
      const data = await res.json();
      // accept several shapes: { items: [...] } or array or { attempts: [...] }
      const attempts = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : Array.isArray(data.attempts)
        ? data.attempts
        : data || [];
      setExpanded((prev) => ({
        ...prev,
        [recipeId]: {
          open: true,
          loading: false,
          attempts,
          error: null,
          choosing: null,
          choosingError: null,
        },
      }));
    } catch (err) {
      setExpanded((prev) => ({
        ...prev,
        [recipeId]: {
          open: true,
          loading: false,
          attempts: [],
          error: String(err.message || err),
          choosing: null,
          choosingError: null,
        },
      }));
    }
  };

  // attempt file select (per-recipe)
  const onAttemptFileSelected = async (recipeId, e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const file = files[0];

    if (!file.type.startsWith("image/")) {
      alert("只支持图片文件");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert(`文件过大，单张最大 ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
      e.target.value = "";
      return;
    }

    setAttemptFormState(recipeId, {
      processingFiles: true,
      errors: {
        ...((attemptForms[recipeId] || {}).errors || {}),
        images: undefined,
      },
    });
    try {
      const orientedCanvas = await drawImageWithExifOrientation(file);
      const previewData = cropCanvasToWebpDataUrl(
        orientedCanvas,
        PREVIEW_SIZE,
        PREVIEW_QUALITY
      );
      const uploadPreviewData = cropCanvasToWebpDataUrl(
        orientedCanvas,
        UPLOAD_SIZE,
        PREVIEW_QUALITY
      );
      setAttemptFormState(recipeId, {
        file,
        previewDataUrl: previewData,
        uploadPreviewDataUrl: uploadPreviewData,
      });
    } catch (err) {
      console.error("Attempt 图片处理失败", err);
      setAttemptFormState(recipeId, {
        file: null,
        previewDataUrl: null,
        uploadPreviewDataUrl: null,
        errors: { images: "图片处理失败" },
      });
    } finally {
      setAttemptFormState(recipeId, { processingFiles: false });
      e.target.value = "";
    }
  };

  const removeAttemptImage = (recipeId) => {
    setAttemptFormState(recipeId, {
      file: null,
      previewDataUrl: null,
      uploadPreviewDataUrl: null,
    });
  };

  const submitAttempt = async (recipeId) => {
    const form = attemptForms[recipeId] || {
      body: "",
      feedback: "",
      file: null,
    };
    setAttemptFormState(recipeId, { submitting: true, errors: {} });

    try {
      let imageUrls = [];

      if (form.file) {
        try {
          const uploadRes = await uploadFileToServer(form.file);
          if (uploadRes && uploadRes.url) {
            imageUrls.push(uploadRes.url);
          } else {
            throw new Error("Upload returned no URL");
          }
        } catch (err) {
          setAttemptFormState(recipeId, {
            submitting: false,
            errors: { images: String(err.message || err) },
          });
          return;
        }
      }

      const payload = {
        body: form.body || undefined,
        feedback: form.feedback || undefined, // <-- include attempt-specific feedback
        images: imageUrls,
      };

      const res = await fetch(`${RECIPES_ENDPOINT}/${recipeId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const bodyRes = await res.json().catch(() => null);
      if (!res.ok) {
        const mapped = mapErrors(bodyRes?.errors);
        setAttemptFormState(recipeId, { submitting: false, errors: mapped });
        return;
      }

      // success: append attempt to expanded list
      setExpanded((prev) => {
        const cur = prev[recipeId] || {
          open: true,
          loading: false,
          attempts: [],
        };
        const newAttempts = [bodyRes, ...(cur.attempts || [])];
        return { ...prev, [recipeId]: { ...cur, attempts: newAttempts } };
      });

      // reset attempt form
      setAttemptFormState(recipeId, {
        body: "",
        feedback: "",
        file: null,
        previewDataUrl: null,
        uploadPreviewDataUrl: null,
        submitting: false,
        errors: {},
      });
    } catch (err) {
      console.error("submit attempt failed", err);
      setAttemptFormState(recipeId, {
        submitting: false,
        errors: { _global: String(err.message || err) },
      });
    }
  };

  // Set an attempt as the recipe's "best" attempt.
  // Strategy: try POST /api/recipes/:recipeId/attempts/:attemptId/choose first,
  // if that fails (404/405) fallback to PATCH /api/recipes/:recipeId { bestAttemptId }.
  const chooseBestAttempt = async (recipeId, attemptId) => {
    // mark choosing state
    setExpanded((prev) => {
      const cur = prev[recipeId] || {
        open: true,
        loading: false,
        attempts: [],
      };
      return {
        ...prev,
        [recipeId]: { ...cur, choosing: attemptId, choosingError: null },
      };
    });

    try {
      // try dedicated endpoint
      let res = await fetch(
        `${RECIPES_ENDPOINT}/${recipeId}/attempts/${attemptId}/choose`,
        { method: "POST" }
      );
      if (!res.ok) {
        // fallback patch
        res = await fetch(`${RECIPES_ENDPOINT}/${recipeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bestAttemptId: attemptId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const msg =
            body && body.errors
              ? body.errors.map((e) => e.message).join("; ")
              : res.statusText;
          throw new Error(`设置最优尝试失败: ${msg}`);
        }
      }

      // success - refresh the recipe data (prefer GET /api/recipes/:id, fallback to full list)
      let updatedRecipe = null;
      const singleRes = await fetch(`${RECIPES_ENDPOINT}/${recipeId}`);
      if (singleRes.ok) {
        const body = await singleRes.json().catch(() => null);
        updatedRecipe =
          body && body.item
            ? body.item
            : body && body.items
            ? body.items[0]
            : body;
      } else {
        // fallback to list fetch
        const listRes = await fetch(RECIPES_ENDPOINT);
        if (listRes.ok) {
          const listBody = await listRes.json().catch(() => null);
          const items = Array.isArray(listBody.items)
            ? listBody.items
            : Array.isArray(listBody)
            ? listBody
            : [];
          updatedRecipe = items.find((x) => x.id === recipeId) || null;
        }
      }

      if (updatedRecipe) {
        // update recipes list
        setRecipes((prev) =>
          prev.map((r) => (r.id === recipeId ? updatedRecipe : r))
        );

        // mark the chosen attempt in expanded attempts (if expanded)
        setExpanded((prev) => {
          const cur = prev[recipeId] || {
            open: true,
            loading: false,
            attempts: [],
          };
          const attempts = cur.attempts || [];
          // best id from server (try multiple possible property names)
          const bestId =
            updatedRecipe.bestAttempt?.id ||
            updatedRecipe.bestAttemptId ||
            updatedRecipe.best_attempt_id ||
            updatedRecipe.best_attempt;
          const newAttempts = attempts.map((a) => ({
            ...a,
            isBest: !!bestId && a.id === bestId,
          }));
          return {
            ...prev,
            [recipeId]: {
              ...cur,
              attempts: newAttempts,
              choosing: null,
              choosingError: null,
            },
          };
        });
      } else {
        // could not fetch updated recipe - still clear choosing flag
        setExpanded((prev) => ({
          ...prev,
          [recipeId]: { ...(prev[recipeId] || {}), choosing: null },
        }));
      }
    } catch (err) {
      console.error("chooseBestAttempt error", err);
      setExpanded((prev) => ({
        ...prev,
        [recipeId]: {
          ...(prev[recipeId] || {}),
          choosing: null,
          choosingError: String(err.message || err),
        },
      }));
    }
  };

  // ---------- render ----------
  return (
    <div style={{ padding: 20 }}>
      <h1>Recipes</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <label>
            Title (required):
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting || processingFiles}
              style={{ marginLeft: 8, width: "60%" }}
            />
          </label>
          {formErrors.title ? (
            <div style={{ color: "crimson" }}>{formErrors.title}</div>
          ) : null}
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            Body:
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={submitting || processingFiles}
              style={{
                display: "block",
                width: "100%",
                minHeight: 80,
                marginTop: 6,
              }}
            />
          </label>
          {formErrors.body ? (
            <div style={{ color: "crimson" }}>{formErrors.body}</div>
          ) : null}
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            Feedback:
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={submitting || processingFiles}
              style={{
                display: "block",
                width: "100%",
                minHeight: 60,
                marginTop: 6,
              }}
            />
          </label>
          {formErrors.feedback ? (
            <div style={{ color: "crimson" }}>{formErrors.feedback}</div>
          ) : null}
        </div>

        <fieldset style={{ marginBottom: 8 }}>
          <legend>
            Image (single). Client auto-corrects EXIF orientation. Server will
            produce 800×800 WebP.
          </legend>

          <div style={{ marginBottom: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileSelected}
              disabled={processingFiles || submitting}
            />
            {processingFiles ? (
              <span style={{ marginLeft: 8 }}>Processing…</span>
            ) : null}
          </div>

          {previewDataUrl ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div
                style={{
                  width: PREVIEW_SIZE,
                  height: PREVIEW_SIZE,
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <img
                  src={previewDataUrl}
                  alt="preview"
                  style={{
                    width: PREVIEW_SIZE,
                    height: PREVIEW_SIZE,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8 }}>{selectedFile?.name}</div>
                <div>
                  <button
                    type="button"
                    onClick={removeImage}
                    disabled={processingFiles || submitting}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                  Preview: {PREVIEW_SIZE}×{PREVIEW_SIZE}. Server will store{" "}
                  {UPLOAD_SIZE}×{UPLOAD_SIZE} WebP.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: "#666", marginTop: 6 }}>No image selected</div>
          )}

          {formErrors.images ? (
            <div style={{ color: "crimson", marginTop: 8 }}>
              {formErrors.images}
            </div>
          ) : null}
        </fieldset>

        {formErrors._global ? (
          <div style={{ color: "crimson", marginBottom: 8 }}>
            {formErrors._global}
          </div>
        ) : null}

        <div>
          <button type="submit" disabled={submitting || processingFiles}>
            {submitting ? "Creating…" : "Create Recipe"}
          </button>
        </div>
      </form>

      {loading ? (
        <div>Loading recipes…</div>
      ) : error ? (
        <div style={{ color: "crimson" }}>Error: {error}</div>
      ) : recipes.length === 0 ? (
        <div>No recipes yet</div>
      ) : (
        <ul>
          {recipes.map((r) => {
            const ex = expanded[r.id] || {
              open: false,
              loading: false,
              attempts: [],
              error: null,
              choosing: null,
              choosingError: null,
            };
            const aForm = attemptForms[r.id] || {
              body: "",
              feedback: "",
              previewDataUrl: null,
              processingFiles: false,
              submitting: false,
              errors: {},
            };

            // Determine best attempt to display in default area:
            // Priority: server-provided r.bestAttempt (object) -> r.bestAttemptId (id lookup in expanded attempts) -> any attempt flagged isBest in expanded
            let bestAttempt = null;
            if (r.bestAttempt) bestAttempt = r.bestAttempt;
            else if (r.bestAttemptId)
              bestAttempt =
                (ex.attempts || []).find((a) => a.id === r.bestAttemptId) ||
                null;
            else
              bestAttempt = (ex.attempts || []).find((a) => a.isBest) || null;

            return (
              <li key={r.id} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <strong>{r.title}</strong>{" "}
                    {r.body ? <span>- {r.body}</span> : null}
                  </div>
                  <div>
                    <button type="button" onClick={() => toggleExpand(r.id)}>
                      {ex.open ? "Hide attempts" : "Show attempts"}
                    </button>
                  </div>
                </div>

                {/* If there's a chosen best attempt, show it in the default area */}
                {bestAttempt ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 10,
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      background: "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong>Chosen best attempt</strong>
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {bestAttempt.createdAt
                          ? new Date(bestAttempt.createdAt).toLocaleString()
                          : ""}
                      </div>
                    </div>
                    <div style={{ marginTop: 6 }}>{bestAttempt.body}</div>
                    {bestAttempt.feedback ? (
                      <div
                        style={{
                          marginTop: 6,
                          fontStyle: "italic",
                          color: "#444",
                        }}
                      >
                        Feedback: {bestAttempt.feedback}
                      </div>
                    ) : null}
                    {Array.isArray(bestAttempt.images) &&
                    bestAttempt.images.length > 0 ? (
                      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                        {bestAttempt.images.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt={`best-${i}`}
                            style={{
                              width: 120,
                              height: 120,
                              objectFit: "cover",
                              borderRadius: 6,
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : // Only show recipe images if there's no best attempt selected
                Array.isArray(r.images) && r.images.length > 0 ? (
                  <div style={{ marginTop: 6 }}>
                    <img
                      src={r.images[0]}
                      alt="thumb"
                      style={{
                        width: 100,
                        height: 100,
                        objectFit: "cover",
                        borderRadius: 6,
                      }}
                    />
                  </div>
                ) : null}

                {ex.open ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      border: "1px solid #eee",
                      borderRadius: 6,
                    }}
                  >
                    {ex.loading ? (
                      <div>Loading attempts…</div>
                    ) : ex.error ? (
                      <div style={{ color: "crimson" }}>
                        Error loading attempts: {ex.error}
                      </div>
                    ) : (
                      <>
                        {/* Display original recipe content when attempts are shown */}
                        <div
                          style={{
                            marginBottom: 12,
                            padding: 8,
                            border: "1px solid #f0f0f0",
                            borderRadius: 6,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <strong>Original Recipe</strong>
                            </div>
                            <div style={{ fontSize: 12, color: "#666" }}>
                              {r.createdAt
                                ? new Date(r.createdAt).toLocaleString()
                                : ""}
                            </div>
                          </div>
                          <div style={{ marginTop: 6 }}>{r.body}</div>
                          {r.feedback ? (
                            <div
                              style={{
                                marginTop: 6,
                                fontStyle: "italic",
                                color: "#444",
                              }}
                            >
                              Feedback: {r.feedback}
                            </div>
                          ) : null}
                          {Array.isArray(r.images) && r.images.length > 0 ? (
                            <div
                              style={{ marginTop: 8, display: "flex", gap: 6 }}
                            >
                              {r.images.map((src, i) => (
                                <img
                                  key={i}
                                  src={src}
                                  alt={`recipe-${i}`}
                                  style={{
                                    width: 80,
                                    height: 80,
                                    objectFit: "cover",
                                    borderRadius: 4,
                                  }}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div style={{ marginBottom: 8 }}>
                          <strong>Attempts</strong>
                        </div>

                        {ex.attempts.length === 0 ? (
                          <div style={{ color: '#666', marginBottom: 8 }}>No attempts yet</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                            {ex.attempts.map((a, idx) => (
                              // Skip rendering the attempt that is already shown as "best attempt"
                              (bestAttempt && bestAttempt.id === a.id) ? null : (
                                <div key={a.id || idx} style={{ padding: 8, border: '1px solid #f0f0f0', borderRadius: 6, position: 'relative' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: 14 }}>{a.body}</div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      {a.isBest ? <div style={{ fontSize: 12, color: 'green', fontWeight: 600 }}>Best</div> : null}
                                      <button
                                        type="button"
                                        onClick={() => chooseBestAttempt(r.id, a.id)}
                                        disabled={!!ex.choosing || ex.choosing === a.id}
                                        title="Set this attempt as the best one"
                                      >
                                        {ex.choosing === a.id ? 'Choosing…' : 'Set as Best'}
                                      </button>
                                    </div>
                                  </div>

                                  <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{a.createdAt ? new Date(a.createdAt).toLocaleString() : null}</div>
                                  {a.feedback ? <div style={{ marginTop: 6, fontStyle: 'italic', color: '#444' }}>Feedback: {a.feedback}</div> : null}
                                  {Array.isArray(a.images) && a.images.length > 0 ? (
                                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                                      {a.images.map((src, i) => (
                                        <img key={i} src={src} alt={`attempt-${i}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }} />
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              )
                            ))}
                          </div>
                        )}

                        {/* Add Attempt Form */}
                        <div style={{ marginTop: 8 }}>
                          <div style={{ marginBottom: 6 }}>
                            <label>
                              Attempt body:
                              <textarea
                                value={aForm.body}
                                onChange={(e) =>
                                  setAttemptFormState(r.id, {
                                    body: e.target.value,
                                  })
                                }
                                disabled={
                                  aForm.submitting || aForm.processingFiles
                                }
                                style={{
                                  display: "block",
                                  width: "100%",
                                  minHeight: 60,
                                  marginTop: 6,
                                }}
                              />
                            </label>
                            {aForm.errors && aForm.errors.body ? (
                              <div style={{ color: "crimson" }}>
                                {aForm.errors.body}
                              </div>
                            ) : null}
                          </div>

                          <div style={{ marginBottom: 6 }}>
                            <label>
                              Attempt feedback:
                              <textarea
                                value={aForm.feedback}
                                onChange={(e) =>
                                  setAttemptFormState(r.id, {
                                    feedback: e.target.value,
                                  })
                                }
                                disabled={
                                  aForm.submitting || aForm.processingFiles
                                }
                                style={{
                                  display: "block",
                                  width: "100%",
                                  minHeight: 40,
                                  marginTop: 6,
                                }}
                              />
                            </label>
                            {aForm.errors && aForm.errors.feedback ? (
                              <div style={{ color: "crimson" }}>
                                {aForm.errors.feedback}
                              </div>
                            ) : null}
                          </div>

                          <div style={{ marginBottom: 8 }}>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => onAttemptFileSelected(r.id, e)}
                              disabled={
                                aForm.processingFiles || aForm.submitting
                              }
                            />
                            {aForm.processingFiles ? (
                              <span style={{ marginLeft: 8 }}>Processing…</span>
                            ) : null}
                          </div>

                          {aForm.previewDataUrl ? (
                            <div
                              style={{
                                display: "flex",
                                gap: 12,
                                alignItems: "center",
                                marginBottom: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: PREVIEW_SIZE,
                                  height: PREVIEW_SIZE,
                                  border: "1px solid #ddd",
                                  borderRadius: 6,
                                  overflow: "hidden",
                                }}
                              >
                                <img
                                  src={aForm.previewDataUrl}
                                  alt="attempt-preview"
                                  style={{
                                    width: PREVIEW_SIZE,
                                    height: PREVIEW_SIZE,
                                    objectFit: "cover",
                                    display: "block",
                                  }}
                                />
                              </div>
                              <div>
                                <div style={{ marginBottom: 8 }}>
                                  {aForm.file?.name}
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button
                                    type="button"
                                    onClick={() => removeAttemptImage(r.id)}
                                    disabled={
                                      aForm.processingFiles || aForm.submitting
                                    }
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div
                                  style={{
                                    marginTop: 8,
                                    fontSize: 12,
                                    color: "#666",
                                  }}
                                >
                                  Preview: {PREVIEW_SIZE}×{PREVIEW_SIZE}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ color: "#666", marginBottom: 8 }}>
                              No image selected for attempt
                            </div>
                          )}

                          {aForm.errors && aForm.errors.images ? (
                            <div style={{ color: "crimson", marginBottom: 8 }}>
                              {aForm.errors.images}
                            </div>
                          ) : null}
                          {aForm.errors && aForm.errors._global ? (
                            <div style={{ color: "crimson", marginBottom: 8 }}>
                              {aForm.errors._global}
                            </div>
                          ) : null}

                          <div>
                            <button
                              type="button"
                              onClick={() => submitAttempt(r.id)}
                              disabled={
                                aForm.submitting || aForm.processingFiles
                              }
                            >
                              {aForm.submitting ? "Submitting…" : "Add Attempt"}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    {ex.choosingError ? (
                      <div style={{ color: "crimson", marginTop: 8 }}>
                        {ex.choosingError}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
