import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { buildMd5Trace, formatWord, toHex32 } from './md5';

const REGISTER_NAMES = ['A', 'B', 'C', 'D'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes, maxBytes = 64) {
  if (!bytes || bytes.length === 0) {
    return '(empty)';
  }

  const view = bytes.slice(0, maxBytes).map((value) => value.toString(16).padStart(2, '0'));
  const suffix = bytes.length > maxBytes ? ' ...' : '';
  return `${view.join(' ')}${suffix}`;
}

function getEventTitle(event) {
  if (!event) {
    return 'No step selected';
  }

  if (event.type === 'preprocess') {
    return 'Preprocess input and apply MD5 padding';
  }

  if (event.type === 'chunk-start') {
    return `Chunk ${event.chunkIndex + 1}: load M[0..15] and initialize A, B, C, D`;
  }

  if (event.type === 'round') {
    return `Chunk ${event.chunkIndex + 1} round ${event.stepWithinChunk}/64 using function ${event.functionName}`;
  }

  if (event.type === 'chunk-end') {
    return `Chunk ${event.chunkIndex + 1}: add working registers back into hash state`;
  }

  return 'Final digest assembled from A, B, C, D';
}

function getCurrentDigest(event, trace) {
  if (!trace) {
    return '';
  }

  if (!event) {
    return trace.digest;
  }

  return event.digestPreview ?? event.digestAfterChunk ?? event.digest ?? trace.digest;
}

function resolveChunkIndex(event, trace) {
  if (!trace || trace.chunks.length === 0) {
    return 0;
  }

  if (event && Number.isInteger(event.chunkIndex)) {
    return clamp(event.chunkIndex, 0, trace.chunks.length - 1);
  }

  if (event?.type === 'done') {
    return trace.chunks.length - 1;
  }

  return 0;
}

function RegisterTable({ title, values }) {
  if (!values) {
    return null;
  }

  return (
    <div className="register-box">
      <h4>{title}</h4>
      <div className="register-grid">
        {values.map((value, index) => (
          <div key={`${title}-${REGISTER_NAMES[index]}`} className="register-item">
            <span className="label">{REGISTER_NAMES[index]}</span>
            <code>{formatWord(value)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function HashTable({ title, values }) {
  if (!values) {
    return null;
  }

  return (
    <div className="register-box">
      <h4>{title}</h4>
      <div className="register-grid">
        {values.map((value, index) => (
          <div key={`${title}-H${index}`} className="register-item">
            <span className="label">H{index}</span>
            <code>{formatWord(value)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const viewportRef = useRef(null);
  const stageRef = useRef(null);
  const [inputType, setInputType] = useState('text');
  const [inputValue, setInputValue] = useState('abc');
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(180);
  const [scale, setScale] = useState(1);

  const traceResult = useMemo(() => {
    try {
      return {
        trace: buildMd5Trace(inputValue, inputType),
        error: '',
      };
    } catch (nextError) {
      return {
        trace: null,
        error: nextError instanceof Error ? nextError.message : 'Unable to parse input.',
      };
    }
  }, [inputType, inputValue]);

  const trace = traceResult.trace;
  const error = traceResult.error;
  const maxStep = trace ? trace.events.length - 1 : 0;
  const currentStep = clamp(step, 0, maxStep);
  const playingActive = isPlaying && currentStep < maxStep;

  useLayoutEffect(() => {
    const updateScale = () => {
      if (!viewportRef.current || !stageRef.current) {
        return;
      }

      const viewportWidth = viewportRef.current.clientWidth;
      const viewportHeight = viewportRef.current.clientHeight;
      const stageWidth = stageRef.current.scrollWidth;
      const stageHeight = stageRef.current.scrollHeight;

      if (!viewportWidth || !viewportHeight || !stageWidth || !stageHeight) {
        return;
      }

      const nextScale = Math.min(1, viewportWidth / stageWidth, viewportHeight / stageHeight);
      setScale((previous) => (Math.abs(previous - nextScale) < 0.01 ? previous : nextScale));
    };

    updateScale();
    const resizeObserver = new ResizeObserver(updateScale);

    if (viewportRef.current) {
      resizeObserver.observe(viewportRef.current);
    }

    if (stageRef.current) {
      resizeObserver.observe(stageRef.current);
    }

    window.addEventListener('resize', updateScale);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [trace, currentStep, inputValue, inputType, speed, isPlaying, error]);

  useEffect(() => {
    if (!isPlaying || !trace) {
      return undefined;
    }

    if (currentStep >= maxStep) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setStep((current) => Math.min(current + 1, maxStep));
    }, speed);

    return () => window.clearTimeout(timer);
  }, [currentStep, isPlaying, maxStep, speed, trace]);

  const event = trace?.events[currentStep] ?? null;
  const currentDigest = getCurrentDigest(event, trace);
  const chunkIndex = useMemo(() => resolveChunkIndex(event, trace), [event, trace]);
  const activeChunk = trace?.chunks[chunkIndex] ?? null;
  const highlightedWord = event?.type === 'round' ? event.g : -1;
  const progress = maxStep > 0 ? Math.round((currentStep / maxStep) * 100) : 0;

  const onStepChange = (nextStep) => {
    if (!trace) {
      return;
    }
    setStep(clamp(nextStep, 0, maxStep));
  };

  const resetPlayback = () => {
    setIsPlaying(false);
    setStep(0);
  };

  const roundWindow = useMemo(() => {
    if (event?.type !== 'round' || !trace) {
      return [];
    }

    const start = Math.max(0, event.roundIndex - 2);
    const end = Math.min(63, event.roundIndex + 2);
    const rows = [];

    for (let i = start; i <= end; i += 1) {
      rows.push({
        index: i,
        shift: trace.shifts[i],
        constant: trace.constants[i],
      });
    }

    return rows;
  }, [event, trace]);

  return (
    <div className="fit-viewport" ref={viewportRef}>
      <div className="app-shell" ref={stageRef} style={{ transform: `scale(${scale})` }}>
        <header className="hero">
          <p className="hero-tag">md5algorithm.com</p>
          <h1>MD5 algorithm explained online step by step visually</h1>
          <p>
            This website will help you understand how a md5 hash is calculated from start to finish.
          </p>
        </header>

        <section className="panel controls">
          <div className="input-row">
            <label>
              Input mode
              <select
                value={inputType}
                onChange={(eventValue) => {
                  resetPlayback();
                  setInputType(eventValue.target.value);
                }}
              >
                <option value="text">Text (UTF-8)</option>
                <option value="hex">Hex bytes</option>
              </select>
            </label>

            <label className="wide">
              Message
              <textarea
                value={inputValue}
                onChange={(eventValue) => {
                  resetPlayback();
                  setInputValue(eventValue.target.value);
                }}
                placeholder={inputType === 'hex' ? '61 62 63' : 'Type any message...'}
                spellCheck={false}
              />
            </label>
          </div>

          <div className="buttons-row">
            <button type="button" onClick={() => onStepChange(0)} disabled={!trace || currentStep === 0}>
              |&lt;
            </button>
            <button type="button" onClick={() => onStepChange(currentStep - 10)} disabled={!trace || currentStep === 0}>
              -10
            </button>
            <button type="button" onClick={() => onStepChange(currentStep - 1)} disabled={!trace || currentStep === 0}>
              -1
            </button>
            <button
              type="button"
              onClick={() => {
                if (playingActive) {
                  setIsPlaying(false);
                  return;
                }

                if (currentStep >= maxStep) {
                  setStep(0);
                }

                setIsPlaying(true);
              }}
              disabled={!trace || maxStep === 0}
            >
              {playingActive ? 'Pause' : 'Play'}
            </button>
            <button type="button" onClick={() => onStepChange(currentStep + 1)} disabled={!trace || currentStep >= maxStep}>
              +1
            </button>
            <button type="button" onClick={() => onStepChange(currentStep + 10)} disabled={!trace || currentStep >= maxStep}>
              +10
            </button>
            <button type="button" onClick={() => onStepChange(maxStep)} disabled={!trace || currentStep >= maxStep}>
              &gt;|
            </button>

            <label className="speed-control">
              Speed
              <input
                type="range"
                min="60"
                max="900"
                step="20"
                value={speed}
                onChange={(eventValue) => setSpeed(Number(eventValue.target.value))}
              />
              <span>{speed}ms</span>
            </label>
          </div>

          <div className="progress-row" aria-live="polite">
            <div className="progress-header">
              <strong>
                Step {currentStep} / {maxStep}
              </strong>
              <span>{getEventTitle(event)}</span>
            </div>
            <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={maxStep} aria-valuenow={currentStep}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {error && <div className="error-box">{error}</div>}
        </section>

        {trace && (
          <section className="panel-grid">
            <article className="panel panel-explainer">
              <h2>Step explainer</h2>
              <p className="subtitle">{getEventTitle(event)}</p>

            {event?.type === 'preprocess' && (
              <div className="kv-list">
                <div>
                  <span>Input length</span>
                  <code>
                    {event.inputLengthBytes} bytes ({event.inputLengthBits} bits)
                  </code>
                </div>
                <div>
                  <span>Padding added</span>
                  <code>{event.addedBytes} bytes</code>
                </div>
                <div>
                  <span>Padded message length</span>
                  <code>
                    {event.paddedLengthBytes} bytes ({event.paddedLengthBits} bits)
                  </code>
                </div>
                <div>
                  <span>Chunk count</span>
                  <code>{event.chunkCount}</code>
                </div>
              </div>
            )}

            {event?.type === 'round' && (
              <div className="kv-list">
                <div>
                  <span>Round family</span>
                  <code>{event.functionName}</code>
                </div>
                <div>
                  <span>Boolean function</span>
                  <code>{event.functionFormula}</code>
                </div>
                <div>
                  <span>Word index rule</span>
                  <code>{event.indexFormula}</code>
                </div>
                <div>
                  <span>Selected message word</span>
                  <code>
                    g = {event.g}, M[g] = {formatWord(event.messageWord)}
                  </code>
                </div>
              </div>
            )}

            {event?.type === 'chunk-end' && (
              <p className="hint">
                At the end of a chunk, MD5 adds the working registers back into the running hash state (mod 2^32).
              </p>
            )}

            {event?.type === 'done' && (
              <p className="hint">Digest complete. The output is the little-endian concatenation of A, B, C, and D.</p>
            )}

            <div className="digest-box">
              <h3>Current digest</h3>
              <code>{currentDigest}</code>
              {event?.type === 'round' && <p className="hint">Preview value for this round. Final MD5 is at the last step.</p>}
            </div>
            </article>

            <article className="panel panel-message">
            <h2>Message and chunks</h2>
            <div className="kv-list">
              <div>
                <span>Original bytes (hex)</span>
                <code>{formatBytes(trace.inputBytes, 80)}</code>
              </div>
              <div>
                <span>Padded bytes (hex)</span>
                <code>{formatBytes(trace.paddedBytes, 128)}</code>
              </div>
              <div>
                <span>Active chunk</span>
                <code>
                  {chunkIndex + 1}/{trace.chunks.length}
                </code>
              </div>
            </div>

            <h3>Chunk bytes</h3>
            <pre>{formatBytes(activeChunk?.bytes ?? [], 64)}</pre>

            <h3>M[0..15] little-endian words</h3>
            <div className="word-grid">
              {(activeChunk?.words ?? []).map((word, index) => (
                <div key={`word-${index}`} className={`word-item ${index === highlightedWord ? 'active' : ''}`}>
                  <span>M[{index}]</span>
                  <code>{formatWord(word)}</code>
                </div>
              ))}
            </div>
            </article>

            <article className="panel panel-round">
            <h2>Round math</h2>
            {event?.type === 'round' ? (
              <>
                <div className="kv-list">
                  <div>
                    <span>i</span>
                    <code>{event.roundIndex}</code>
                  </div>
                  <div>
                    <span>K[i]</span>
                    <code>{formatWord(event.constant)}</code>
                  </div>
                  <div>
                    <span>s[i]</span>
                    <code>{event.shift}</code>
                  </div>
                  <div>
                    <span>Function output</span>
                    <code>{formatWord(event.functionResult)}</code>
                  </div>
                </div>

                <div className="equation">
                  <p>
                    sum = A + f + K[i] + M[g] = <code>{formatWord(event.sum)}</code>
                  </p>
                  <p>
                    rotate(sum, s[i]) = <code>{formatWord(event.rotated)}</code>
                  </p>
                  <p>
                    B&apos; = B + rotate(sum, s[i]) = <code>{formatWord(event.registersAfter[1])}</code>
                  </p>
                </div>

                <h3>Constants around i</h3>
                <div className="word-grid constants-grid">
                  {roundWindow.map((row) => (
                    <div key={`k-window-${row.index}`} className={`word-item ${row.index === event.roundIndex ? 'active' : ''}`}>
                      <span>i={row.index}</span>
                      <code>K={toHex32(row.constant)}</code>
                      <code>s={row.shift}</code>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="hint">Move to a round step to inspect the boolean function, constants, shifts, and arithmetic.</p>
            )}
            </article>

            <article className="panel panel-register">
            <h2>Registers and hash state</h2>
            {event?.type === 'round' && (
              <>
                <RegisterTable title="Registers before round" values={event.registersBefore} />
                <RegisterTable title="Registers after round" values={event.registersAfter} />
              </>
            )}

            {event?.type === 'chunk-start' && (
              <>
                <HashTable title="Hash before chunk" values={event.hashBefore} />
                <RegisterTable title="Working registers initialized" values={event.registersBefore} />
              </>
            )}

            {event?.type === 'chunk-end' && (
              <>
                <RegisterTable title="Working registers after 64 rounds" values={event.registersBeforeAdd} />
                <HashTable title="Hash before add" values={event.hashBefore} />
                <HashTable title="Hash after add" values={event.hashAfter} />
              </>
            )}

            {event?.type === 'preprocess' && <HashTable title="Initial MD5 state" values={trace.initialHash} />}

            {event?.type === 'done' && (
              <>
                <HashTable title="Final state words" values={event.hash} />
                <div className="digest-box final">
                  <h3>Final MD5</h3>
                  <code>{event.digest}</code>
                </div>
              </>
            )}
            </article>
          </section>
        )}
      </div>
    </div>
  );
}

export default App;
