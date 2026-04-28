const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function wrapHandler(handler) {
  if (typeof handler !== 'function' || handler.length === 4) return handler;
  return function asyncRouteHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function wrapAsyncRouter(router) {
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => original(path, ...handlers.map(wrapHandler));
  }
  return router;
}
