
import axios from 'axios'
import Koa from 'koa'
import Router from 'koa-router'

import conf from './conf'
import {auth} from './middleware'
import controllerRoutes from './routers'
import cacheControl from 'koa-cache-control'

let app = new Koa()

var router = controllerRoutes(new Router());

app.use(cacheControl());

app.use(router.routes())
   .use(router.allowedMethods());

app.listen(conf.port, conf.host);
console.log(`app listen at ${conf.port}`)