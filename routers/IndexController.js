import {auth} from '../middleware'
import ini from '../lib/ini'
import fs from 'fs'
import path from 'path'
import conf from '../conf'
import axios from 'axios'
import rules from '../rules'
import base64 from 'base64-stream'
import Promise from 'bluebird'

export default class IndexController {
  constructor(router) {
    router.get("/", this.fetch)
  }

  fetch = async (ctx) => {

    let queryU = ctx.query['u']
    let gfw = ctx.query['gfw']

    if (!queryU) {
      ctx.status = 401;
      return;
    }

    let user = Buffer.from(queryU, 'base64').toString()
    let userConfig = conf[user];

    if (!userConfig) {
      ctx.status = 401;
      return;
    }

    let sourcePath = userConfig['source']
    let baseSurge = {}

    if (sourcePath.startsWith("http")) {
      let {data} = await axios(sourcePath);
      baseSurge = ini.parse(data) 
    } else {
      let sourceLocalPath = path.resolve(__dirname, '../surge/', sourcePath)
      baseSurge = ini.parse(fs.readFileSync(sourceLocalPath, 'utf-8'))
    }

    let remoteConfigs = userConfig['remote'];
    let targetSurge = { ...baseSurge }
    let targeProxyGroup = targetSurge['Proxy Group']
    try {
      let proxyPromise = Promise.map(remoteConfigs, (remoteConfig) => 
          Promise.resolve(axios(remoteConfig['url']))
                 .then(item => ini.parse(item.data))
                 .then((remoteSurge) => (targeProxyGroup[remoteConfig['name']] = this.bumpProxyGroup(remoteSurge['Proxy']), remoteSurge))
      )
      .reduce((targetProxy, remoteSurge) => this.bumpProxy(targetProxy, remoteSurge['Proxy']), targetSurge['Proxy'])

      let works = [proxyPromise]
      let originalRules = targetSurge['Rule']
      
      if (gfw) {
        let gfwListPromise = Promise.resolve(
          axios({
            method:'get',
            url:'https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt',
            responseType:'stream'
          })
          .then(response => rules(response.data.pipe(base64.decode()), userConfig['proxyRule']))
        )
        .reduce((data, item) => (data[item] = null, data), {})
        .then(rules => ({...rules, ...originalRules}))

        works.push(gfwListPromise)
      } else {
        works.push(originalRules)
      }

      let [proxy, rule] = await Promise.all(works)
      targetSurge['Proxy'] = proxy
      targetSurge['Proxy Group'] = this.bumpRemoteGroupName(targeProxyGroup, remoteConfigs);
      targetSurge['Rule'] = rule
      
    } catch(e) {
      console.error(e);
    }
    ctx.cacheControl = {public:true, maxAge: 60}
    ctx.body = [
                `#!MANAGED-CONFIG ${conf['MANAGED-CONFIG']}`, 
                `?u=${ctx.query['u']}${gfw ? "&gfw=true": ""}\n`,
                `${ini.stringify(targetSurge)}`
               ].join('')
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

  bumpProxyGroup = (proxies) => `url-test, ${Object.keys(proxies).join(",")}, url = http://www.google.com/generate_204`
}