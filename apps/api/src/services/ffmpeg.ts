import { spawn, SpawnOptions, ChildProcess } from 'child_process';

function useDocker(): boolean {
  return process.env.FFMPEG_USE_DOCKER === 'true';
}

// When FFmpeg runs inside Docker it can't reach "localhost" on the host —
// replace it with host.docker.internal (works on Windows Docker Desktop
// automatically; Linux needs extra_hosts in docker-compose).
function fixHosts(arg: string): string {
  return arg.replace(/\blocalhost\b/g, 'host.docker.internal');
}

export function spawnFFmpeg(args: string[], options: SpawnOptions = {}): ChildProcess {
  if (!useDocker()) {
    return spawn('ffmpeg', args, options);
  }

  const dockerArgs = [
    'run', '--rm', '-i',
    'jrottenberg/ffmpeg:latest',
    ...args.map(fixHosts),
  ];

  return spawn('docker', dockerArgs, options);
}
