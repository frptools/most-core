/** @license MIT License (c) copyright 2010 original author or authors */

import { disposeOnce, tryDispose } from '@most/disposable'
import LinkedList from '../LinkedList'
import { empty, isCanonicalEmpty } from '../source/empty'
import { id as identity } from '@most/prelude'
import { schedulerRelativeTo } from '@most/scheduler'

export const mergeConcurrently = (concurrency, stream) =>
  mergeMapConcurrently(identity, concurrency, stream)

export const mergeMapConcurrently = (f, concurrency, stream) =>
  isCanonicalEmpty(stream) ? empty()
    : new MergeConcurrently(f, concurrency, stream)

class MergeConcurrently {
  constructor (f, concurrency, source) {
    this.f = f
    this.concurrency = concurrency
    this.source = source
  }

  run (runStream, sink, scheduler) {
    return new Outer(this.f, runStream, this.concurrency, this.source, sink, scheduler)
  }
}

class Outer {
  constructor (f, runStream, concurrency, source, sink, scheduler) {
    this.f = f
    this.runStream = runStream;
    this.concurrency = concurrency
    this.sink = sink
    this.scheduler = scheduler
    this.pending = []
    this.current = new LinkedList()
    this.disposable = disposeOnce(runStream(source, this, scheduler))
    this.active = true
  }

  event (t, x) {
    this._addInner(t, x)
  }

  _addInner (t, x) {
    if (this.current.length < this.concurrency) {
      this._startInner(t, x)
    } else {
      this.pending.push(x)
    }
  }

  _startInner (t, x) {
    try {
      this._initInner(t, x)
    } catch (e) {
      this.error(t, e)
    }
  }

  _initInner (t, x) {
    const innerSink = new Inner(t, this, this.sink)
    innerSink.disposable = mapAndRun(this.f, this.runStream, t, x, innerSink, this.scheduler)
    this.current.add(innerSink)
  }

  end (t) {
    this.active = false
    tryDispose(t, this.disposable, this.sink)
    this._checkEnd(t)
  }

  error (t, e) {
    this.active = false
    this.sink.error(t, e)
  }

  dispose () {
    this.active = false
    this.pending.length = 0
    this.disposable.dispose()
    this.current.dispose()
  }

  _endInner (t, inner) {
    this.current.remove(inner)
    tryDispose(t, inner, this)

    if (this.pending.length === 0) {
      this._checkEnd(t)
    } else {
      this._startInner(t, this.pending.shift())
    }
  }

  _checkEnd (t) {
    if (!this.active && this.current.isEmpty()) {
      this.sink.end(t)
    }
  }
}

const mapAndRun = (f, t, x, runStream, sink, scheduler) =>
  runStream(f(x), sink, schedulerRelativeTo(t, scheduler))

class Inner {
  constructor (time, outer, sink) {
    this.prev = this.next = null
    this.time = time
    this.outer = outer
    this.sink = sink
    this.disposable = void 0
  }

  event (t, x) {
    this.sink.event(t + this.time, x)
  }

  end (t) {
    this.outer._endInner(t + this.time, this)
  }

  error (t, e) {
    this.outer.error(t + this.time, e)
  }

  dispose () {
    return this.disposable.dispose()
  }
}
