export default function() {
  return async function(ctx, next) {
    let UA = ctx.headers['user-agent'];
    if (UA.indexOf("Surge") === -1) {
      ctx.status = 401;
      return
    }
    await next()
  }
}