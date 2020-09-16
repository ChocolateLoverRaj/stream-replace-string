const path = require('path');
const fsPromises = require('fs').promises;

const outputPath = path.join(__dirname, "../dist/cjs/index.cjs");

const inputOptions = {
    input: path.join(__dirname, "../index.js"),
    external: [
        'stream',
        'string_decoder'
    ]
};

const outputOptions = {
    file: outputPath,
    format: 'cjs',
    exports: 'default'
};

var alreadyBuilt;

const build = async rollup => {
    console.warn("Building CommonJs file using rollup. Please switch to using ESModules.");

    const save = async () => {
        const bundle = await rollup.rollup(inputOptions);

        await bundle.write(outputOptions);

        alreadyBuilt = true;
    }

    if (alreadyBuilt === undefined) {
        try {
            await fsPromises.stat(outputPath);
            alreadyBuilt = true;
        }
        catch (e) {
            if (e.code === 'ENOENT') {
                alreadyBuilt = false;
            }
            else {
                throw e;
            }
        }
    }
    if (alreadyBuilt === false) {
        save();
    }
};

module.exports = build;