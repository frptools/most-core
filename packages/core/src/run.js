/** @license MIT License (c) copyright 2010-2017 original author or authors */

// Run a Stream, sending all its events to the
// provided Sink.
export const run = (runStream, sink, scheduler, stream) =>
    runStream(stream, sink, scheduler)
