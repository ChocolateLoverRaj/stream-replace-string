import { Transform, Readable } from 'stream';
import { StringDecoder } from 'string_decoder';

/**
 * 
 * @param {string} searchStr 
 * @param {string} replaceWith
 * @param {number} limit
 */
const replace = (searchStr, replaceWith, options = {}) => {
    //Defaulting
    if (!options.hasOwnProperty("limit")) {
        options.limit = Infinity;
    }
    if (!options.hasOwnProperty("bufferReplaceStream")) {
        options.bufferReplaceStream = true;
    }

    //Type checking
    if (typeof searchStr !== 'string') {
        throw new TypeError("searchStr must be a string.");
    }
    if (!(
        typeof replaceWith === 'string' ||
        replaceWith instanceof Promise ||
        typeof replaceWith === 'function' ||
        replaceWith instanceof Readable
    )) {
        throw new TypeError("replaceWith must be either a string, a promise resolving a string, a function returning string, a function returning a promise resolving a string, or a readable stream.");
    }
    if (typeof options !== 'object') {
        throw new TypeError("options must be an object.");
    }
    if (!(Number.isInteger(options.limit) && options.limit > 0 || options.limit === Infinity)) {
        throw new TypeError("options.limit must be a positive integer or infinity.");
    }
    if (typeof options.bufferReplaceStream !== 'boolean') {
        throw new TypeError("options.bufferReplaceStream must be a boolean.");
    }
    const limit = options.limit;

    //This stuff is for if replaceWith is a readable stream
    var replaceWithBuffer = '';
    var replaceWithNewChunk;
    var isDecodingReplaceWithStream = false;
    const startDecodingReplaceWithStream = () => {
        isDecodingReplaceWithStream = true;
        let stringDecoder = new StringDecoder('utf-8')
        let dataHandler = data => {
            replaceWithNewChunk = stringDecoder.write(data)
            if (options.bufferReplaceStream) {
                replaceWithBuffer += replaceWithNewChunk;
            }
        };

        let endHandler = () => {
            replaceWithNewChunk = stringDecoder.end();
            if (options.bufferReplaceStream) {
                replaceWithBuffer += replaceWithNewChunk;
            }
        }

        replaceWith
            .on('data', dataHandler)
            .on('end', endHandler);
    }
    if (replaceWith instanceof Readable) {
        if (options.bufferReplaceStream) {
            startDecodingReplaceWithStream();
        }
        else {
            replaceWith.pause();
        }
    }


    //Create a new string decoder to turn buffers into strings
    const stringDecoder = new StringDecoder('utf-8');

    //Whether the limit has been reached
    var doneReplacing = false;
    //Then number of matches
    var matches = 0;

    //The in progress matches waiting for next chunk to be continued
    const crossChunkMatches = [];

    //The string data that we aren't yet sure it's part of the search string or not
    //We have to hold on to this until we are sure.
    var unsureBuffer = '';

    //Get the replace string
    let replaceStr = typeof replaceWith === 'string' ? replaceWith : undefined;
    const pushReplaceStr = async () => {
        switch (typeof replaceWith) {
            case 'string':
                transform.push(replaceStr);
                break;
            case 'function':
                const returnedStr = await replaceWith(matches);
                if (typeof returnedStr !== 'string') {
                    throw new TypeError("Replace function did not return a string or a promise resolving a string.");
                }
                transform.push(returnedStr);
                break;
            case 'object':
                if (replaceWith instanceof Promise) {
                    replaceStr = await replaceWith;
                    if (typeof replaceStr !== 'string') {
                        throw new TypeError("Replace promise did not resolve to a string.");
                    }
                    transform.push(replaceStr);
                }
                else if (replaceWith instanceof Readable) {
                    await new Promise((resolve, reject) => {
                        if (!isDecodingReplaceWithStream) {
                            startDecodingReplaceWithStream();
                        }
                        //Push the buffer so far
                        transform.push(replaceWithBuffer)
                        if (!replaceWith.readableEnded) {
                            replaceWith
                                .on('data', () => {
                                    transform.push(replaceWithNewChunk);
                                })
                                .once('end', () => {
                                    transform.push(replaceWithNewChunk);
                                    resolve();
                                });
                            replaceWith.resume();
                        }
                        else {
                            resolve();
                        }
                    });
                }
                break;
            default:
                throw new Error("This shouldn't happen.");
        }
    }

    const foundMatch = () => {
        matches++;
        if (matches === limit) {
            doneReplacing = true;
        }
    }

    const transform = new Transform({
        async transform(chunk, encoding, callback) {
            if (doneReplacing) {
                callback(false, chunk);
            }
            else {
                //Convert to utf-8
                const chunkStr = stringDecoder.write(chunk);

                //The number of bytes passed in this chunk
                let bytesPassed = 0;

                //Continue cross chunk search
                let i = 0;
                for (let matchIndex = 0; matchIndex < crossChunkMatches.length; matchIndex++) {
                    const match = crossChunkMatches[matchIndex];
                    const remainingLength = searchStr.length - match;
                    const crossesBoundary = remainingLength > chunkStr.length;
                    if (crossesBoundary) {
                        //This is for if the search will be partially done
                        if (chunkStr === searchStr.slice(match, match + chunkStr.length)) {
                            crossChunkMatches[matchIndex] += chunkStr.length;
                        }
                        else {
                            crossChunkMatches.splice(matchIndex, 1);
                        }
                    }
                    else {
                        //This is for the search being complete
                        if (chunkStr.startsWith(searchStr.slice(match))) {
                            //Release that memory
                            this.push(unsureBuffer.slice(0, unsureBuffer.length - match));
                            await pushReplaceStr();

                            //Reset unsureBuffer and cross chunk matches
                            unsureBuffer = '';
                            crossChunkMatches.splice(0);

                            bytesPassed = searchStr.length - match;
                            i += remainingLength;
                            foundMatch();
                        }
                        else {
                            crossChunkMatches.splice(matchIndex, 1);
                        }
                    }
                }

                //The index of the first held byte
                let firstHeldByte;

                //Look for new matches
                for (; i < chunkStr.length && !doneReplacing; i++) {
                    const boundaryCross = i + searchStr.length - chunkStr.length;
                    const restOfChunk = chunkStr.slice(i);
                    if (boundaryCross > 0) {
                        //This is for the search starting partially
                        if (restOfChunk === searchStr.slice(0, chunkStr.length - i)) {
                            if (!firstHeldByte) {
                                firstHeldByte = i;
                            }
                            crossChunkMatches.push(chunkStr.length - i);
                        }
                    }
                    else {
                        //This is for the search to be complete just in this chunk
                        if (restOfChunk.startsWith(searchStr)) {
                            //Release that memory
                            this.push(unsureBuffer);
                            this.push(chunkStr.slice(bytesPassed, i));
                            await pushReplaceStr();

                            //Reset unsureBuffer and cross chunk matches
                            unsureBuffer = '';
                            crossChunkMatches.splice(0);

                            bytesPassed += i + searchStr.length;
                            i += searchStr.length - 1;
                            foundMatch();
                        }
                    }
                }

                //Callback extra memory that's not held
                callback(false, chunkStr.slice(bytesPassed, firstHeldByte));

                //Add held bytes to buffer
                if (firstHeldByte) {
                    unsureBuffer += chunkStr.slice(firstHeldByte);
                }
            }
        },
        flush(callback) {
            //Release the unSureBuffer
            callback(false, unsureBuffer);
        }
    });

    return transform;
};

export default replace;