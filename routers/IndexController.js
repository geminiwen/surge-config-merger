import {auth} from '../middleware'
import ini from '../lib/ini'
import fs from 'fs'
import path from 'path'
import conf from '../conf'
import axios from 'axios'

export default class IndexController {
  constructor(router) {
    router.get("/", this.fetch)
  }

  fetch = async (ctx) => {

    let queryU = ctx.query['u']

    if (!queryU) {
      ctx.status = 401;
      return;
    }

    let user = Buffer.from(queryU, 'base64').toString()

    if (!conf['source'][user]) {
      ctx.status = 401;
      return;
    }

    let sourcePath = conf['source'][user]
    let baseSurge = {}

    if (sourcePath.startsWith("http")) {
      let {data} = await axios(sourcePath);
      baseSurge = ini.parse(data) 
    } else {
      let sourceLocalPath = path.resolve(__dirname, '../surge/', sourcePath)
      baseSurge = ini.parse(fs.readFileSync(sourceLocalPath, 'utf-8'))
    }

    let remoteConfigs = conf['remote'][user];
    let targetSurge = { ...baseSurge }
    
    try {
      remoteConfigs.forEach(remoteConfig => {
        let remoteConfigName = remoteConfig['name']
        let {data} = await axios(remoteConfig['url'])
        let remoteSurge = ini.parse(data);
        let targeProxyGroup = targetSurge['Proxy Group']

        targetSurge['Proxy'] = this.bumpProxy(baseSurge['Proxy'], remoteSurge['Proxy'])
        // TODO 策略选择 不一定是 url-test
        targeProxyGroup[remoteConfigName] = `url-test, ${this.bumpProxyGroup(remoteSurge['Proxy'])}, url = http://www.google.com/generate_204`
      })
      targetSurge['Proxy Group'] = this.bumpRemoteGroupName(targeProxyGroup, remoteConfigs);
    } catch(e) {
      console.error(e);
    }
    ctx.cacheControl = {public:true, maxAge: 60}
    ctx.body = `#!MANAGED-CONFIG ${conf['MANAGED-CONFIG']}?u=${ctx.query['u']}\n${ini.stringify(targetSurge)}`
  }

  bumpRemoteGroupName = (base, configs) => {
    let names = configs.map((e) => e.name).join(",");
    let target = {};
    for (const config in base) {
      let value = base[config];
      target[config] = value.replace("${REMOTE}", names);
    }
    return target
  }


  bumpProxy = (base, proxy) => {
    let target = {...base}
    for (const proxyName in proxy ) {
      target[proxyName] = proxy[proxyName]
    }
    return target;
  }

  bumpProxyGroup = (proxies) => {
    return Object.keys(proxies).join(",")
  }
}