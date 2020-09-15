import { Transform } from 'stream';
import { StringDecoder } from 'string_decoder';

/**
 * 
 * @param {string} searchStr 
 * @param {string} replaceStr
 * @param {number} limit
 */
const replace = (searchStr, replaceStr, limit) => {
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

    const foundMatch = () => {
        matches++;
        if (matches === limit) {
            doneReplacing = true;
        }
    }

    const transform = new Transform({
        transform(chunk, encoding, callback) {
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
                            this.push(replaceStr);

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
                            this.push(replaceStr);

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
}

import through2 from 'through2';

const inputStream = through2();

const outputDecoder = new StringDecoder('utf-8');
var output = '';

inputStream
    .pipe(replace("babel", "yellow", 2))
    .once('end', () => {
        console.log("result", output)
    })
    .on('data', data => {
        output += outputDecoder.write(data);
    });

inputStream.write("baba");
inputStream.write("babab");
inputStream.write("el. ba")
inputStream.end();