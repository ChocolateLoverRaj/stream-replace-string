import baretest from 'baretest'
import { strictEqual } from 'assert'
import replace from './index.js'
import { Readable } from 'stream'
import streamToString from 'stream-to-string'

const test = baretest('Tests')

test('no change', async () => {
  strictEqual(await streamToString(Readable.from([
    'paper\n',
    'pajamas\n',
    'socks\n'
  ]).pipe(replace('pinapple', 'apple'))), 'paper\npajamas\nsocks\n')
})

test('chunk boundary', async () => {
  strictEqual(await streamToString(Readable.from([
    'pap',
    'aper',
    'socks'
  ]).pipe(replace('paper', 'stuff that we write on'))), 'pastuff that we write onsocks')
})

test('within chunk boundary', async () => {
  strictEqual(await streamToString(Readable.from([
    'red\n',
    'grey\n',
    'orange\n'
  ]).pipe(replace('grey', 'gray'))), 'red\ngray\norange\n')
})

test('mystery bug', async () => {
  strictEqual(await streamToString(Readable.from([
    'One two one\n',
    'One two one\n',
    'One two one two\n',
    'One two one two\n'
  ]).pipe(replace('two', 'three'))), [
    'One three one\n',
    'One three one\n',
    'One three one three\n',
    'One three one three\n'
  ].join(''))
})

const allTestsPassed = await test.run()
if (!allTestsPassed) process.exitCode = 1
