import { isAbortError, throwIfAborted } from "@/utils/chat/abort";
import { sanitizeFilename } from "@/utils/documents/shared";
import { safeJsonParse } from "@/utils/formatters";
import { saveGeneratedDocument } from "@/utils/fs/generatedDocuments";
import { type ToolExecutionContext } from "@/utils/ToolsManager";
import i18n from "@/i18n";
import { getConfiguredLLMProvider, parseToolArgs, reportGeneratedFile, generatedFileResult, type StreamEmitter } from "../createFiles/shared";

type MotionGraphicsStyle = 'schematic_explainer' | 'isometric_3d' | 'story_reel' | 'infographic';
type AnimationStyle = 'rise' | 'zoom' | 'slide' | 'float';

type Args = {
    topic: string;
    style: MotionGraphicsStyle;
    duration_seconds: number;
    dialect: string;
};

type StoryboardScene = {
    title: string;
    duration_seconds: number;
    narration: string;
    visual_animation_cues: string[];
    on_screen_text: string;
    animation: AnimationStyle;
};

type Storyboard = {
    title: string;
    summary: string;
    style: MotionGraphicsStyle;
    dialect: string;
    duration_seconds: number;
    voiceover_script: string;
    palette: {
        background: string;
        foreground: string;
        accent: string;
        secondary: string;
    };
    typography: {
        font_family: string;
        heading_style: string;
        body_style: string;
        caption_style: string;
    };
    scenes: StoryboardScene[];
};

const STYLES: MotionGraphicsStyle[] = ['schematic_explainer', 'isometric_3d', 'story_reel', 'infographic'];
const ANIMATIONS: AnimationStyle[] = ['rise', 'zoom', 'slide', 'float'];

const STYLE_GUIDANCE: Record<MotionGraphicsStyle, string> = {
    schematic_explainer: 'Use a clear, step-by-step visual explanation with labeled shapes, arrows, and a precise editorial layout.',
    isometric_3d: 'Use an isometric-inspired composition, layered depth, geometric objects, and deliberate parallax-like motion.',
    story_reel: 'Use a bold vertical social-story rhythm, short readable phrases, strong focal points, and fast but smooth transitions.',
    infographic: 'Use data-led visual hierarchy, simple charts or comparisons, concise labels, and clear number-focused scenes.',
};

function text(value: unknown, fallback = '', maxLength = 500): string {
    // eslint-disable-next-line no-control-regex
    return String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function validColor(value: unknown, fallback: string): string {
    const candidate = String(value ?? '').trim();
    return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
}

function extractStoryboardJson(response: string): Record<string, unknown> | null {
    const cleaned = String(response ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
    const direct = safeJsonParse(cleaned, null);
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct as Record<string, unknown>;
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const extracted = safeJsonParse(cleaned.slice(start, end + 1), null);
    return extracted && typeof extracted === 'object' && !Array.isArray(extracted) ? extracted as Record<string, unknown> : null;
}

function fallbackScenes(topic: string): StoryboardScene[] {
    return [
        {
            title: `The question: ${topic}`,
            duration_seconds: 1,
            narration: `Let us take a closer look at ${topic}.`,
            visual_animation_cues: ['A single focal shape fades in, then a fine outline traces its edge.'],
            on_screen_text: topic,
            animation: 'rise',
        },
        {
            title: 'The key idea',
            duration_seconds: 1,
            narration: `The central idea is to understand the parts and how they connect.`,
            visual_animation_cues: ['Two labeled elements slide into place and connect with a clean line.'],
            on_screen_text: 'See how the pieces connect',
            animation: 'slide',
        },
        {
            title: 'A clear takeaway',
            duration_seconds: 1,
            narration: `With that picture in mind, the main takeaway becomes easier to remember.`,
            visual_animation_cues: ['The main elements resolve into one balanced composition, then hold.'],
            on_screen_text: 'Understand it. Remember it.',
            animation: 'zoom',
        },
    ];
}

function normalizeStoryboard(raw: Record<string, unknown>, args: Args): Storyboard {
    const paletteRaw = raw.palette && typeof raw.palette === 'object' ? raw.palette as Record<string, unknown> : {};
    const typographyRaw = raw.typography && typeof raw.typography === 'object' ? raw.typography as Record<string, unknown> : {};
    const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
    const maxScenes = Math.max(2, Math.min(12, args.duration_seconds));
    const normalizedScenes = rawScenes
        .filter((scene): scene is Record<string, unknown> => Boolean(scene) && typeof scene === 'object' && !Array.isArray(scene))
        .slice(0, maxScenes)
        .map((scene, index): StoryboardScene => {
            const cues = Array.isArray(scene.visual_animation_cues)
                ? scene.visual_animation_cues.map((cue) => text(cue, '', 240)).filter(Boolean).slice(0, 5)
                : [];
            const animation = ANIMATIONS.includes(scene.animation as AnimationStyle) ? scene.animation as AnimationStyle : ANIMATIONS[index % ANIMATIONS.length];
            return {
                title: text(scene.title, `Scene ${index + 1}`, 100) || `Scene ${index + 1}`,
                duration_seconds: Number.isFinite(Number(scene.duration_seconds)) && Number(scene.duration_seconds) > 0 ? Number(scene.duration_seconds) : 1,
                narration: text(scene.narration, '', 700),
                visual_animation_cues: cues.length ? cues : ['Shapes and labels enter smoothly, then settle into a clear composition.'],
                on_screen_text: text(scene.on_screen_text, '', 120),
                animation,
            };
        });
    const scenes = normalizedScenes.length >= 2 ? normalizedScenes : fallbackScenes(args.topic).slice(0, maxScenes);
    const totalWeight = scenes.reduce((sum, scene) => sum + Math.min(2, Math.max(0.75, scene.duration_seconds)), 0);
    let assignedSeconds = 0;
    const timedScenes = scenes.map((scene, index) => {
        const duration = index === scenes.length - 1
            ? Math.round((args.duration_seconds - assignedSeconds) * 1000) / 1000
            : Math.round((args.duration_seconds * Math.min(2, Math.max(0.75, scene.duration_seconds)) / totalWeight) * 1000) / 1000;
        assignedSeconds += duration;
        return { ...scene, duration_seconds: duration };
    });
    const voiceoverScript = text(raw.voiceover_script, '', 7000) || timedScenes.map((scene) => scene.narration).filter(Boolean).join('\n\n');

    return {
        title: text(raw.title, args.topic, 140) || args.topic,
        summary: text(raw.summary, `A ${args.duration_seconds}-second ${args.style.replace(/_/g, ' ')} motion graphic about ${args.topic}.`, 500),
        style: args.style,
        dialect: text(raw.dialect, args.dialect, 100) || args.dialect,
        duration_seconds: args.duration_seconds,
        voiceover_script: voiceoverScript,
        palette: {
            background: validColor(paletteRaw.background, '#101827'),
            foreground: validColor(paletteRaw.foreground, '#F8FAFC'),
            accent: validColor(paletteRaw.accent, '#38BDF8'),
            secondary: validColor(paletteRaw.secondary, '#A78BFA'),
        },
        typography: {
            font_family: text(typographyRaw.font_family, 'Arial, sans-serif', 100).replace(/[;{}]/g, '') || 'Arial, sans-serif',
            heading_style: text(typographyRaw.heading_style, 'Bold, concise headings with strong contrast.', 240),
            body_style: text(typographyRaw.body_style, 'Readable short lines with generous spacing.', 240),
            caption_style: text(typographyRaw.caption_style, 'Small, high-contrast captions.', 240),
        },
        scenes: timedScenes.map((scene) => ({ ...scene, narration: scene.narration || 'A concise voiceover line that supports the visual idea.' })),
    };
}

function buildRemotionSource(storyboard: Storyboard): string {
    const storyboardJson = JSON.stringify(storyboard, null, 2);
    return `/**
 * Remotion motion graphic source generated by Upgrade AI.
 * The structured scene plan, voiceover, animation cues, and typography are in STORYBOARD below.
 * This is React/TypeScript source, not a rendered video. Register MotionGraphic in your Remotion root.
 */
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const STORYBOARD = ${storyboardJson} as const;
export const FPS = 30;
export const WIDTH = STORYBOARD.style === 'story_reel' ? 1080 : 1920;
export const HEIGHT = STORYBOARD.style === 'story_reel' ? 1920 : 1080;
export const DURATION_IN_FRAMES = Math.round(STORYBOARD.duration_seconds * FPS);

const COLORS = STORYBOARD.palette;
const TYPE = STORYBOARD.typography;

function SceneLayer({
  scene,
  index,
  startFrame,
  endFrame,
}: {
  scene: (typeof STORYBOARD.scenes)[number];
  index: number;
  startFrame: number;
  endFrame: number;
}) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const localFrame = Math.max(0, frame - startFrame);
  const segmentFrames = Math.max(1, endFrame - startFrame);
  const entrance = spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 90 } });
  const opacity = interpolate(localFrame, [Math.max(0, segmentFrames - 12), segmentFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const offset = scene.animation === 'rise'
    ? { x: 0, y: interpolate(entrance, [0, 1], [48, 0]) }
    : scene.animation === 'slide'
      ? { x: interpolate(entrance, [0, 1], [width * 0.08, 0]), y: 0 }
      : scene.animation === 'float'
        ? { x: 0, y: Math.sin((localFrame + index * 12) / fps) * 12 }
        : { x: 0, y: 0 };
  const scale = scene.animation === 'zoom' ? interpolate(entrance, [0, 1], [0.92, 1]) : 1;
  const cardTransform = STORYBOARD.style === 'isometric_3d'
    ? 'perspective(1000px) rotateX(8deg) rotateY(-7deg)'
    : 'none';

  return (
    <AbsoluteFill style={{ opacity, justifyContent: 'center', padding: width * 0.09 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 18% 22%, ' + COLORS.accent + '33, transparent 42%)' }} />
      <div style={{ position: 'absolute', right: '8%', top: '14%', width: '22%', height: '22%', borderRadius: STORYBOARD.style === 'schematic_explainer' ? 18 : 999, border: '2px solid ' + COLORS.secondary + '88', opacity: 0.45, transform: cardTransform }} />
      <div style={{ position: 'relative', maxWidth: '100%', transform: 'translate3d(' + offset.x + 'px, ' + offset.y + 'px, 0) scale(' + scale + ')', fontFamily: TYPE.font_family }}>
        <div style={{ color: COLORS.accent, fontSize: Math.round(width * 0.018), fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 22 }}>
          {String(index + 1).padStart(2, '0')} / {String(STORYBOARD.scenes.length).padStart(2, '0')}
        </div>
        <div style={{ color: COLORS.foreground, fontSize: Math.round(width * 0.064), fontWeight: 800, lineHeight: 1.05, maxWidth: '92%', marginBottom: 26 }}>
          {scene.on_screen_text || scene.title}
        </div>
        {scene.on_screen_text ? (
          <div style={{ color: COLORS.foreground, opacity: 0.72, fontSize: Math.round(width * 0.027), lineHeight: 1.35, maxWidth: '78%' }}>
            {scene.title}
          </div>
        ) : null}
        <div style={{ width: Math.round(width * 0.12), height: 6, backgroundColor: COLORS.secondary, borderRadius: 99, marginTop: 34 }} />
      </div>
    </AbsoluteFill>
  );
}

export const MotionGraphic: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let cursorSeconds = 0;
  const segments = STORYBOARD.scenes.map((scene, index) => {
    const startFrame = Math.round(cursorSeconds * fps);
    cursorSeconds += scene.duration_seconds;
    const endFrame = index === STORYBOARD.scenes.length - 1
      ? DURATION_IN_FRAMES
      : Math.round(cursorSeconds * fps);
    return { scene, index, startFrame, endFrame };
  });
  const active = segments.find((segment) => frame >= segment.startFrame && frame < segment.endFrame) || segments[segments.length - 1];

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, color: COLORS.foreground }}>
      {active ? <SceneLayer key={active.index} {...active} /> : null}
    </AbsoluteFill>
  );
};

export default MotionGraphic;
`;
}

const SYSTEM_PROMPT = `You are a motion-graphics storyboard artist. Create a clear, accurate, visually specific storyboard and voiceover for a short Remotion motion graphic.
Return valid JSON only: no markdown, no code fences, no prose outside the JSON. Do not return or execute code.
Use the requested language and dialect naturally in the title, summary, scene titles, on-screen text, and voiceover. Keep narration concise and speakable. Make visual animation cues concrete and achievable with React shapes and text; do not assume external images or audio assets.
Return exactly this shape:
{
  "title": "...",
  "summary": "...",
  "dialect": "...",
  "voiceover_script": "Complete voiceover text, in scene order",
  "palette": { "background": "#112233", "foreground": "#FFFFFF", "accent": "#33AADD", "secondary": "#BB88FF" },
  "typography": { "font_family": "Arial, sans-serif", "heading_style": "...", "body_style": "...", "caption_style": "..." },
  "scenes": [
    { "title": "...", "duration_seconds": 5, "narration": "...", "visual_animation_cues": ["...", "..."], "on_screen_text": "...", "animation": "rise" }
  ]
}
Use 3-8 scenes, a beginning-middle-end narrative, and animation values only from: rise, zoom, slide, float. The requested total duration is authoritative; scene durations may be approximate and will be normalized to fit exactly.`;

export default {
    id: 'motionGraphics',
    get name() { return i18n.t('tools.motion_graphics.name'); },
    get description() { return i18n.t('tools.motion_graphics.description'); },
    defaultEnabled: false,
    category: 'default',
    supportsOnDevice: true,
    definition: {
        type: 'function',
        function: {
            name: 'generate_motion_graphic',
            description:
                'Generate a structured motion-graphics storyboard (scene-by-scene voiceover, visual animation cues, and typography) and save clean Remotion React/TypeScript source as a downloadable .tsx file. This creates source code, not a rendered video.',
            parameters: {
                type: 'object',
                properties: {
                    topic: {
                        type: 'string',
                        description: 'The subject and key message of the motion graphic.',
                    },
                    style: {
                        type: 'string',
                        enum: STYLES,
                        description: 'Visual direction: schematic_explainer, isometric_3d, story_reel, or infographic.',
                    },
                    duration_seconds: {
                        type: 'integer',
                        minimum: 5,
                        maximum: 90,
                        description: 'Target duration in seconds, from 5 to 90. Scene timings are fitted to this exact duration.',
                    },
                    dialect: {
                        type: 'string',
                        description: 'Voiceover language and dialect/register, e.g. Iraqi Arabic, Modern Standard Arabic, or English (US).',
                    },
                },
                required: ['topic', 'style', 'duration_seconds', 'dialect'],
            },
        },
    },
    config: { styles: STYLES, minimumDurationSeconds: 5, maximumDurationSeconds: 90 },
    execute: async function (args: unknown, streamEmitter: StreamEmitter, context: ToolExecutionContext = {}): Promise<string> {
        try {
            const parsed = parseToolArgs<Args>(args, { topic: '', style: 'schematic_explainer', duration_seconds: 30, dialect: 'Modern Standard Arabic' });
            const topic = text(parsed.topic, '', 500);
            if (!topic) return 'No topic provided. No motion graphic was created.';
            if (!STYLES.includes(parsed.style)) return `Invalid style. Choose one of: ${STYLES.join(', ')}.`;
            const durationSeconds = Number(parsed.duration_seconds);
            if (!Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 90) {
                return 'duration_seconds must be a whole number from 5 to 90. No motion graphic was created.';
            }
            const dialect = text(parsed.dialect, 'Modern Standard Arabic', 100) || 'Modern Standard Arabic';
            const normalizedArgs: Args = { topic, style: parsed.style, duration_seconds: durationSeconds, dialect };
            const filename = sanitizeFilename(`${topic}-motion-graphic`, 'tsx', 'motion-graphic');

            throwIfAborted(context.signal);
            streamEmitter('report_status', i18n.t('tools.motion_graphics.status_generating', { topic }));
            const llmProvider = await getConfiguredLLMProvider();
            const response = await llmProvider.runBasicChatCompletion([
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: [
                        `Topic: ${topic}`,
                        `Visual style: ${normalizedArgs.style}. ${STYLE_GUIDANCE[normalizedArgs.style]}`,
                        `Exact target duration: ${durationSeconds} seconds.`,
                        `Voiceover language and dialect/register: ${dialect}.`,
                        `Create 3-${Math.min(8, Math.max(3, Math.ceil(durationSeconds / 8)))} well-paced scenes. Base claims on established knowledge and avoid fabricated statistics.`,
                    ].join('\n'),
                },
            ]);
            throwIfAborted(context.signal);
            const rawStoryboard = extractStoryboardJson(response?.textResponse ?? '');
            if (!rawStoryboard) throw new Error('The model did not return a valid structured storyboard.');
            const storyboard = normalizeStoryboard(rawStoryboard, normalizedArgs);

            streamEmitter('report_status', i18n.t('tools.motion_graphics.status_building'));
            const source = buildRemotionSource(storyboard);
            streamEmitter('report_status', i18n.t('tools.create_files.status_creating', { name: filename }));
            const saved = await saveGeneratedDocument({
                fileType: 'motion-graphic',
                extension: 'tsx',
                displayFilename: filename,
                content: source,
                encoding: 'utf8',
            });
            reportGeneratedFile(streamEmitter, saved, 'text/plain');
            streamEmitter('report_status', i18n.t('tools.create_files.status_created', { name: filename }));
            return generatedFileResult('Remotion React/TypeScript source file', saved, ` with ${storyboard.scenes.length} storyboard scenes and a ${durationSeconds}-second timeline`);
        } catch (error) {
            if (isAbortError(error)) throw error;
            console.error(`Motion Graphics Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return `There was an error generating the motion graphic: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    },
} as const;
