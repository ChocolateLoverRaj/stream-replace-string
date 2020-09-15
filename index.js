import { Transform } from 'stream';

const replace = () => {
    const transform = new Transform({
        transform(chunk, encoding, callback) {
            callback(false, chunk + ' hi')
        }
    });

    return transform;
}

import through2 from 'through2';

const inputStream = through2();

inputStream.pipe(replace()).pipe(process.stdout);

inputStream.write("hi");
inputStream.write("bye")