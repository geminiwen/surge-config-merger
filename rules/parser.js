const {URL} = require('url')
const through2 = require("through2")
const fs = require("fs")

const path = require("path")

let tlds = new Set(fs.readFileSync(path.resolve(__dirname, '../surge', './tld.txt'), "utf-8").split("\n"))

var Parser = function () {
    this.domains = new Set();
}

function getHostName(domain) {
    if (!domain.startsWith("http:")) {
        domain = "http://" + domain
    }
    try {
        let url = new URL(domain)
        return url.hostname
    } catch (e) {
        // Nothings
    }
    return
    
}

function addDomainToSet(domains, domain) {
    let host = getHostName(domain);
    if (!host) return
    if (host.startsWith(".")) 
        host = host.substring(1)
    if (host.endsWith('/')) {
        host = host.slice(0, -1)
    }
    if (host) {
        domains.add(host)
    }
}

Parser.prototype.add = function(domain) {
    addDomainToSet(this.domains, domain)
}

function reduceDomains (domains, tlds) {
    let newDomains = new Set()
    for(let domain of domains) {
        let domainParts = domain.split('.')
        let lastRootDomain = undefined
        let domainPartsLength = domainParts.length
        for (let i = 0; i < domainParts.length; i ++) {
            let rootDomain = (domainParts.slice(domainPartsLength - i - 1)).join('.')
        if (i == 0 && !tlds.has(rootDomain))break
            lastRootDomain = rootDomain
            if (tlds.has(rootDomain)) continue
            else break
        }
        if (lastRootDomain) newDomains.add(lastRootDomain)
    }
    return newDomains
}


Parser.prototype.process = function() {
    let domains = this.domains;
    return through2.obj(function(domain, enc, cb) {
        do {
            if (domain.indexOf(".*") >= 0) break;
            else if (domain.indexOf('*')) domain = domain.replace('*', '/')
            if (domain.startsWith("!")) break
            else if (domain.startsWith('[')) break
            else if (domain.startsWith('@')) break
            else if (domain.startsWith('||')) domain = domain.substring(2)
            else if (domain.startsWith('|') || domain.startsWith('.')) domain = domain.substring(1)
            let host = getHostName(domain);
            if (!host) break
            if (host.startsWith(".")) 
                host = host.substring(1)
            if (host.endsWith('/')) {
                host = host.slice(0, -1)
            }
            
            if (host) {
                this.push(host);
            }
        } while(false)
        cb();
    })
   
}

Parser.prototype.filter = function () {
    let domains = this.domains;
    return through2.obj(function(domain, enc, cb) {
        addDomainToSet(domains, domain);
        cb();
    }, function (cb) {
        let targetDomains = reduceDomains(domains, tlds);
        for (let targetDomain of targetDomains) {
            this.push(targetDomain);
        }
        cb();
    })
}

module.exports = Parser;