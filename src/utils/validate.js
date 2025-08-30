// src/utils/validate.js
// 返回结构化的错误对象 { field, message }
function buildError(field, message) {
    return { field: field || null, message: String(message || '') };
  }
  
  // 兼容：单条错误方便调用
  function sendError(res, status, message) {
    // 旧代码可能直接调用 sendError(res, 400, '...')，我们转换为结构化格式
    const err = buildError(null, message);
    return sendErrors(res, status, [err]);
  }
  
  // 发送一个或多个结构化错误；errors 可以是单个 {field,message} 或数组
  function sendErrors(res, status, errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    // 确保每一项是 { field, message }
    const normalized = list.map(e => {
      if (!e) return buildError(null, 'unknown error');
      if (typeof e === 'string') return buildError(null, e);
      if (typeof e.message === 'string') return { field: e.field || null, message: e.message };
      return buildError(e.field, String(e));
    });
    return res.status(status).json({ errors: normalized });
  }
  
  // 简单的校验帮助
  function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim() !== '';
  }
  function isStringOrEmpty(v) {
    return typeof v === 'string';
  }
  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }
  function ensureArray(v) {
    return Array.isArray(v) ? v : [];
  }
  
  module.exports = {
    buildError,
    sendError,
    sendErrors,
    isNonEmptyString,
    isStringOrEmpty,
    isPlainObject,
    ensureArray
  };