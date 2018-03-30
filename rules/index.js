const Parser = require("./parser")
const through2 = require("through2")
const Promise = require("bluebird")

function readlineTransform() {
    let buffer = '';
    return through2.obj(function(chunk, enc, cb) {
        if (Buffer.isBuffer(chunk)) {
            chunk = chunk.toString('utf8')
        }
        buffer += chunk;
        let idx = buffer.indexOf("\n");
        let line;
        while (idx > -1) {
            idx++;
            line = buffer.substring(0, idx);
            buffer = buffer.substring(idx);
            idx = buffer.indexOf("\n");
            line = line.trim();
            if (line.length > 0) this.push(line);
        }
        cb();
    });
}

function transformToSurge(rule) {
    return through2.obj(function(domain, enc, cb) {
        this.push(`DOMAIN-SUFFIX,${domain},${rule}`)
        cb();
    })
}

module.exports = exports = function (source, rule) {
    let parser = new Parser();
    let group = [];
    return new Promise(function (resolve, reject) {
        source
        .pipe(readlineTransform())
        .pipe(parser.process())
        .pipe(parser.filter())
        .pipe(transformToSurge(rule))
        .on('data', Array.prototype.push.bind(group))
        .on('error', reject)
        .on('end', () => resolve(group))
    })
}

