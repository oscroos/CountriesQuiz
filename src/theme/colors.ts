export type AppColors = {
  background: string;
  backgroundMuted: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  text: string;
  mutedText: string;
  border: string;
  borderStrong: string;
  primary: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  shadow: string;
};

export type AppMapColors = {
  user: string;
  friendOne: string;
  friendTwo: string;
  friendShades: string;
  overlapAll: string;
  unvisited: string;
  stroke: string;
  ocean: string;
  background: string;
  tooltipBg: string;
  tooltipText: string;
};

export type ThemeKey = 'sand' | 'coast' | 'forest' | 'terracotta' | 'bloom' | 'graphite';
export type EditableMapColorKey = 'user' | 'friendOne' | 'friendTwo' | 'friendShades' | 'unvisited';

export type ThemeDefinition = {
  key: ThemeKey;
  label: string;
  palette: readonly string[];
  colors: AppColors;
  mapColors: AppMapColors;
};

export type MapColorPaletteColumn = {
  color: string;
  key: string;
  label: string;
  shades: readonly string[];
};

const themeDefinitions: Record<ThemeKey, ThemeDefinition> = {
  sand: {
    key: 'sand',
    label: 'Sand',
    palette: ['#F6F0E6', '#C9BBA5', '#415A77'],
    colors: {
      background: '#f3efe6',
      backgroundMuted: '#ebe3d4',
      surface: '#fffdf8',
      surfaceRaised: '#ffffff',
      surfaceMuted: '#f6f1e8',
      text: '#162033',
      mutedText: '#667085',
      border: '#ded5c6',
      borderStrong: '#c9bba5',
      primary: '#146c72',
      primarySoft: '#d7f1ef',
      accent: '#d97745',
      accentSoft: '#f7dfcf',
      shadow: '#1f2937',
    },
    mapColors: {
      user: '#1f6fd5',
      friendOne: '#d75b45',
      friendTwo: '#3d9b75',
      friendShades: '#1f6fd5',
      overlapAll: '#162033',
      unvisited: '#b8b1a2',
      stroke: '#f4ede2',
      ocean: '#d7ddd4',
      background: '#f3efe6',
      tooltipBg: 'rgba(22, 32, 51, 0.94)',
      tooltipText: '#fffaf2',
    },
  },
  coast: {
    key: 'coast',
    label: 'Coast',
    palette: ['#EFF6F8', '#87B9C4', '#2F6F7E'],
    colors: {
      background: '#eef5f6',
      backgroundMuted: '#dfecef',
      surface: '#fcfeff',
      surfaceRaised: '#ffffff',
      surfaceMuted: '#f2f8fa',
      text: '#14303b',
      mutedText: '#5d7780',
      border: '#c7d9de',
      borderStrong: '#9ebbc4',
      primary: '#2f6f7e',
      primarySoft: '#d8edf3',
      accent: '#d48259',
      accentSoft: '#f8e2d4',
      shadow: '#16303b',
    },
    mapColors: {
      user: '#2f8cb8',
      friendOne: '#db7a4c',
      friendTwo: '#3d9b75',
      friendShades: '#2f8cb8',
      overlapAll: '#14303b',
      unvisited: '#b0c1c7',
      stroke: '#edf5f6',
      ocean: '#d3e6ea',
      background: '#eef5f6',
      tooltipBg: 'rgba(20, 48, 59, 0.94)',
      tooltipText: '#f8feff',
    },
  },
  forest: {
    key: 'forest',
    label: 'Forest',
    palette: ['#EFF4EE', '#9FB59A', '#47614A'],
    colors: {
      background: '#edf2ea',
      backgroundMuted: '#dfe7db',
      surface: '#fbfdf9',
      surfaceRaised: '#ffffff',
      surfaceMuted: '#f2f6ef',
      text: '#1b2b1f',
      mutedText: '#667763',
      border: '#cdd9ca',
      borderStrong: '#a8b9a2',
      primary: '#47614a',
      primarySoft: '#dcead8',
      accent: '#b7774c',
      accentSoft: '#f1ddcf',
      shadow: '#1f2c20',
    },
    mapColors: {
      user: '#3d8b64',
      friendOne: '#c56a4d',
      friendTwo: '#547cc7',
      friendShades: '#3d8b64',
      overlapAll: '#1b2b1f',
      unvisited: '#afb7ad',
      stroke: '#edf3e8',
      ocean: '#d6e2d2',
      background: '#edf2ea',
      tooltipBg: 'rgba(27, 43, 31, 0.94)',
      tooltipText: '#fbfef9',
    },
  },
  terracotta: {
    key: 'terracotta',
    label: 'Terracotta',
    palette: ['#FFF4EF', '#E2A189', '#8C4132'],
    colors: {
      background: '#f7eee9',
      backgroundMuted: '#efddd3',
      surface: '#fffaf7',
      surfaceRaised: '#ffffff',
      surfaceMuted: '#f8f1ec',
      text: '#2f211d',
      mutedText: '#7c6760',
      border: '#e4ccc0',
      borderStrong: '#d1ab9b',
      primary: '#9b4d3c',
      primarySoft: '#f4ddd4',
      accent: '#c98533',
      accentSoft: '#f8e7d1',
      shadow: '#35231f',
    },
    mapColors: {
      user: '#d06b4c',
      friendOne: '#3b86c7',
      friendTwo: '#5b9d68',
      friendShades: '#d06b4c',
      overlapAll: '#2f211d',
      unvisited: '#bfaaa0',
      stroke: '#f7ede7',
      ocean: '#ead8d0',
      background: '#f7eee9',
      tooltipBg: 'rgba(47, 33, 29, 0.94)',
      tooltipText: '#fff8f5',
    },
  },
  bloom: {
    key: 'bloom',
    label: 'Bloom',
    palette: ['#FFF6F8', '#F0A9C0', '#496C58'],
    colors: {
      background: '#f9f0f4',
      backgroundMuted: '#f1e2e9',
      surface: '#fffafd',
      surfaceRaised: '#ffffff',
      surfaceMuted: '#faf2f6',
      text: '#2a2130',
      mutedText: '#796a7c',
      border: '#e5d1db',
      borderStrong: '#d3b0c0',
      primary: '#c25586',
      primarySoft: '#f6ddea',
      accent: '#4f7a63',
      accentSoft: '#ddeadf',
      shadow: '#302334',
    },
    mapColors: {
      user: '#cf5e8c',
      friendOne: '#4b85c9',
      friendTwo: '#5b996d',
      friendShades: '#cf5e8c',
      overlapAll: '#2a2130',
      unvisited: '#c3b0ba',
      stroke: '#f9eef3',
      ocean: '#eadbe3',
      background: '#f9f0f4',
      tooltipBg: 'rgba(42, 33, 48, 0.94)',
      tooltipText: '#fffafe',
    },
  },
  graphite: {
    key: 'graphite',
    label: 'Graphite',
    palette: ['#F7F7F8', '#9EA3AB', '#2F3640'],
    colors: {
      background: '#f1f2f4',
      backgroundMuted: '#e3e5e9',
      surface: '#fbfcfd',
      surfaceRaised: '#ffffff',
      surfaceMuted: '#f4f5f7',
      text: '#222a35',
      mutedText: '#6d7683',
      border: '#d2d7de',
      borderStrong: '#aeb6c2',
      primary: '#4b627d',
      primarySoft: '#dce4ee',
      accent: '#c98654',
      accentSoft: '#f4e3d6',
      shadow: '#222936',
    },
    mapColors: {
      user: '#4e78bd',
      friendOne: '#c86d52',
      friendTwo: '#5a9476',
      friendShades: '#4e78bd',
      overlapAll: '#222a35',
      unvisited: '#aeb4bd',
      stroke: '#eff1f4',
      ocean: '#d9dee5',
      background: '#f1f2f4',
      tooltipBg: 'rgba(34, 42, 53, 0.94)',
      tooltipText: '#fbfcff',
    },
  },
};

export const defaultThemeKey: ThemeKey = 'sand';

export const themeOptions = (Object.values(themeDefinitions) as ThemeDefinition[]).map((theme) => ({
  key: theme.key,
  label: theme.label,
  palette: theme.palette,
}));

export const editableMapColorKeys = ['user', 'friendOne', 'friendTwo', 'friendShades', 'unvisited'] as const satisfies readonly EditableMapColorKey[];

export const editableMapColorLabels: Record<EditableMapColorKey, string> = {
  user: 'You',
  friendOne: 'Friend #1',
  friendTwo: 'Friend #2',
  friendShades: 'Friend shades',
  unvisited: 'Non-visited',
};

export const mapColorOptions: readonly MapColorPaletteColumn[] = [
  {
    key: 'black',
    label: 'Black',
    color: '#000000',
    shades: ['#3f3f3f', '#767676', '#adadad', '#dddddd'],
  },
  {
    key: 'red',
    label: 'Red',
    color: '#c43a44',
    shades: ['#8e2a31', '#d9646c', '#e79aa0', '#f3d3d5'],
  },
  {
    key: 'orange',
    label: 'Orange',
    color: '#d06b4c',
    shades: ['#9d4d35', '#e08f77', '#ebbaa9', '#f6e0d7'],
  },
  {
    key: 'gold',
    label: 'Gold',
    color: '#c98a2e',
    shades: ['#94631f', '#dbab54', '#e9c98d', '#f5e5c7'],
  },
  {
    key: 'green',
    label: 'Green',
    color: '#3d9b75',
    shades: ['#2b7055', '#61b594', '#94ceb8', '#d3ebe2'],
  },
  {
    key: 'teal',
    label: 'Teal',
    color: '#2f8f83',
    shades: ['#21675e', '#55aa9f', '#8bc8c0', '#d0ece8'],
  },
  {
    key: 'sky',
    label: 'Sky',
    color: '#2f8cb8',
    shades: ['#226687', '#59a7cb', '#91c8e0', '#d2e9f3'],
  },
  {
    key: 'blue',
    label: 'Blue',
    color: '#1f6fd5',
    shades: ['#174f97', '#4e91df', '#8bb8ea', '#d0e1f7'],
  },
  {
    key: 'violet',
    label: 'Violet',
    color: '#7b67c8',
    shades: ['#594897', '#9d8fd8', '#c4bbe9', '#e7e2f6'],
  },
  {
    key: 'pink',
    label: 'Pink',
    color: '#cf5e8c',
    shades: ['#a0446a', '#de89ab', '#ecb7cc', '#f7e0e9'],
  },
] as const;

export const unvisitedMapColorOptions: readonly MapColorPaletteColumn[] = [
  {
    key: 'stone',
    label: 'Stone',
    color: '#b8b1a2',
    shades: [],
  },
  {
    key: 'taupe',
    label: 'Taupe',
    color: '#bfaea0',
    shades: [],
  },
  {
    key: 'sand-light',
    label: 'Sand',
    color: '#d4c8b5',
    shades: [],
  },
  {
    key: 'mist',
    label: 'Mist',
    color: '#c8c9c4',
    shades: [],
  },
  {
    key: 'pebble',
    label: 'Pebble',
    color: '#b1b7bf',
    shades: [],
  },
  {
    key: 'ash',
    label: 'Ash',
    color: '#c7c4bd',
    shades: [],
  },
  {
    key: 'linen',
    label: 'Linen',
    color: '#ddd4c7',
    shades: [],
  },
  {
    key: 'sage-light',
    label: 'Sage',
    color: '#c8d1c3',
    shades: [],
  },
  {
    key: 'powder',
    label: 'Powder',
    color: '#d4dde2',
    shades: [],
  },
  {
    key: 'shell',
    label: 'Shell',
    color: '#e4ddd4',
    shades: [],
  },
] as const;

export function getThemeDefinition(themeKey: ThemeKey) {
  return themeDefinitions[themeKey] ?? themeDefinitions[defaultThemeKey];
}

export const colors = themeDefinitions[defaultThemeKey].colors;
export const mapColors = themeDefinitions[defaultThemeKey].mapColors;
