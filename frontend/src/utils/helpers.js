/**
 * 将错误数组映射为对象
 * @param {Array} errsArray - 错误数组
 * @returns {Object} 映射后的错误对象
 */
export function mapErrors(errsArray) {
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

/**
 * 将文件转换为图片对象
 * @param {File} file - 要转换的文件
 * @returns {Promise<HTMLImageElement>} 图片对象的Promise
 */
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

/**
 * 检查值是否为非空字符串
 * @param {*} val - 要检查的值
 * @returns {boolean} 是否为非空字符串
 */
export function isNonEmptyString(val) {
  return typeof val === "string" && val.trim() !== "";
}

/**
 * 检查值是否为字符串或空值
 * @param {*} val - 要检查的值
 * @returns {boolean} 是否为字符串或空值
 */
export function isStringOrEmpty(val) {
  return val === undefined || val === null || typeof val === "string";
}

/**
 * 检查值是否为普通对象
 * @param {*} val - 要检查的值
 * @returns {boolean} 是否为普通对象
 */
export function isPlainObject(val) {
  return (
    val !== null &&
    typeof val === "object" &&
    Object.prototype.toString.call(val) === "[object Object]"
  );
}

/**
 * 确保值为数组
 * @param {*} val - 要确保的值
 * @returns {Array} 数组
 */
export function ensureArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  return [val];
}

/**
 * 读取图片文件并校正 EXIF 方向，返回绘制好图片的 Canvas
 * @param {File} file
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function drawImageWithExifOrientation(file) {
  // 依赖 exifr 库
  const exifr = (await import("exifr")).default;
  const img = await fileToImage(file);
  const orientation = await exifr.orientation(file).catch(() => 1);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let w = img.naturalWidth,
    h = img.naturalHeight;
  // 旋转/翻转处理
  if ([5, 6, 7, 8].includes(orientation)) {
    canvas.width = h;
    canvas.height = w;
  } else {
    canvas.width = w;
    canvas.height = h;
  }
  // 参考 https://stackoverflow.com/a/40867559
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, w, 0);
      break; // horizontal flip
    case 3:
      ctx.transform(-1, 0, 0, -1, w, h);
      break; // 180°
    case 4:
      ctx.transform(1, 0, 0, -1, 0, h);
      break; // vertical flip
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break; // vertical flip + 90°
    case 6:
      ctx.transform(0, 1, -1, 0, h, 0);
      break; // 90°
    case 7:
      ctx.transform(0, -1, -1, 0, h, w);
      break; // horizontal flip + 90°
    case 8:
      ctx.transform(0, -1, 1, 0, 0, w);
      break; // -90°
    default:
      break;
  }
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/**
 * 将 Canvas 裁剪为正方形并导出为 webp dataURL
 * @param {HTMLCanvasElement} canvas
 * @param {number} size - 输出尺寸（宽高）
 * @param {number} quality - webp 质量（0-1）
 * @returns {string} webp dataURL
 */
export function cropCanvasToWebpDataUrl(canvas, size, quality) {
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const ctx = out.getContext("2d");
  // 居中裁剪为正方形
  const minEdge = Math.min(canvas.width, canvas.height);
  const sx = (canvas.width - minEdge) / 2;
  const sy = (canvas.height - minEdge) / 2;
  ctx.drawImage(canvas, sx, sy, minEdge, minEdge, 0, 0, size, size);
  return out.toDataURL("image/webp", quality);
}

/**
 * 上传文件到服务器
 * @param {File} file - 要上传的文件
 * @returns {Promise<Object>} 包含 url 的响应对象
 */
export async function uploadFileToServer(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}
