import IndexController from './IndexController'


export default function (router) {
  new IndexController(router);
  return router
}