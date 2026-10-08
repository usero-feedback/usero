// Published surface of `@usero/sdk/replay`: everything in ./replay except the `__test__` seams, which
// tree-shake out of the bundle. tsup.test.config.ts builds ./replay itself into dist-test/ for the tests.
export {
	captureSnapshotEvents,
	DEFAULT_RECORDING_MODE,
	getCurrentSession,
	maybeIsolateSnapshot,
	RECORDING_CONSENT_COPY,
	sessionReplay,
	type CurrentSessionHandle,
	type RecordingMode,
	type ReplaySampling,
	type SessionReplayInstance,
	type SessionReplayOptions,
} from './replay'
