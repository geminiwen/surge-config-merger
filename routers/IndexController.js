import {auth} from '../middleware'
import ini from '../lib/ini'
import fs from 'fs'
import path from 'path'
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

    let conf = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../conf.json"), "utf-8"))

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
      let proxyFilterRules = fs.readFileSync(path.resolve(__dirname, '../surge/', './proxy-filter.txt'), 'utf-8')
                               .split('\n')
                               .filter(item => item.trim().length > 0)
                               .map(item => new RegExp(item.trim()));

      let proxyPromise = Promise.map(remoteConfigs, (remoteConfig, index, length) => 
          Promise.resolve(axios(remoteConfig['url']))
                 .then(item => ini.parse(item.data))
                 .then((remoteSurge) => ({ name: remoteConfig['name'], config: remoteSurge }))
                 .catch((e) => ({ name: remoteConfig['name'], config: {'Proxy': {}} }))
      )
      .reduce((targetProxy, remoteSurge, index, length) => {
        let {name, config} = remoteSurge
        
        let isLast = index == (length - 1)
        if (Object.keys(config['Proxy']).length == 0) {
          if (isLast) {
            targeProxyGroup = this.clearProxyGroupHolder(targeProxyGroup)
          }
          return targetProxy;
        }

        let proxies = this.filterProxies(config['Proxy'], proxyFilterRules);

        targeProxyGroup[name] = this.bumpProxyGroup(proxies);
        targeProxyGroup = this.joinProxyGroup(targeProxyGroup, name, isLast)

        return this.bumpProxy(targetProxy, proxies)
      }, targetSurge['Proxy'])

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
      targetSurge['Proxy Group'] = targeProxyGroup
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

  joinProxyGroup = (base, configName, isLast) => {
    let target = {};
    for (const config in base) {
      let value = base[config];
      target[config] = value.replace("${REMOTE}", configName + (isLast ? "" : ",${REMOTE}"));
    }
    return target
  }

  clearProxyGroupHolder = (base) => {
    let target = {};
    for (const config in base) {
      let value = base[config];
      target[config] = value.replace(",${REMOTE}", "");
    }
    return target 
  }
  
  bumpProxy = (base, proxies) => {
    let target = {...base}
    for (const proxyName in proxies ) {
      target[proxyName] = proxies[proxyName]
    }
    return target;
  }

  filterProxies = (proxyData, filterRules = []) => {
    let proxies = Object.keys(proxyData);
    let target = {};

    for (const proxyName in proxyData) {
      let shouldFilter = filterRules.reduce((result, item) => (result || item.test(proxyName)), false)
      if (shouldFilter) continue;
      target[proxyName] = proxyData[proxyName]
    }
    return target;
  }

  bumpProxyGroup = (proxyData) => {
    let proxies = Object.keys(proxyData);
    return `url-test, ${proxies.join(",")}, url = http://www.google.com/generate_204`
  }
}