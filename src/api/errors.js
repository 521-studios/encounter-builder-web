// Prefer the API's specific error reason (ApiError/LetsRollError carry the parsed
// body, e.g. { error: "monster[0]: ref must reference content..." }) over the
// generic "request failed: 400" message. Falls back for non-API errors.
export function errorMessage(e) {
  if (e && e.body && typeof e.body === 'object' && e.body.error) return e.body.error
  return (e && e.message) || String(e)
}
