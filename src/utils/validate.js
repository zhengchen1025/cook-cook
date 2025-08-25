// src/utils/validate.js
function sendError(res, status, message) {
    return res.status(status).json({ error: message });
  }
  
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
    sendError,
    isNonEmptyString,
    isStringOrEmpty,
    isPlainObject,
    ensureArray
  };