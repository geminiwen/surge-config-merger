import Parser from './parser'
import through2 from 'through2'
import Promise from 'bluebird'
import split2 from 'split2'
import fs from 'fs'
import path from 'path'


function transformToSurge(rule) {

    let forceRemoteDns = fs.readFileSync(path.resolve(__dirname, "../surge", "./remote-dns.txt"), "utf-8")
        .split("\n")
        .reduce((array,item) => {
            let domain = item.trim();
            if (!domain.startsWith('#') && domain.length > 0) {
                array.push(new RegExp(item));
            }
            return array
        }, [])

    return through2.obj(function(domain, enc, cb) {
        let shouldForceRemoteDns = forceRemoteDns.reduce((result, item) => (result || item.test(domain)), false)
        let record = [
            'DOMAIN-SUFFIX', domain, rule 
        ]

        shouldForceRemoteDns && record.push['force-remote-dns']
        cb(null, record.join(","));
    })
}

module.exports = exports = function (source, rule) {
    let parser = new Parser();
    let group = [];
    return new Promise(function (resolve, reject) {
        source
        .pipe(split2())
        .pipe(parser.process())
        .pipe(parser.filter())
        .pipe(transformToSurge(rule))
        .on('data', Array.prototype.push.bind(group))
        .on('error', reject)
        .on('end', () => resolve(group))
    })
}

