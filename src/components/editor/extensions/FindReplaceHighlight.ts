import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface FindHighlightMatch {
  from: number;
  to: number;
}

interface FindHighlightState {
  matches: FindHighlightMatch[];
  activeIndex: number;
}

export const findReplaceHighlightKey = new PluginKey<FindHighlightState>('dociumFindReplaceHighlight');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findReplaceHighlight: {
      setFindHighlight: (matches: FindHighlightMatch[], activeIndex: number) => ReturnType;
      clearFindHighlight: () => ReturnType;
    };
  }
}

export const FindReplaceHighlight = Extension.create({
  name: 'findReplaceHighlight',

  addCommands() {
    return {
      setFindHighlight:
        (matches, activeIndex) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findReplaceHighlightKey, { matches, activeIndex });
            tr.setMeta('addToHistory', false);
            dispatch(tr);
          }
          return true;
        },
      clearFindHighlight:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findReplaceHighlightKey, { matches: [], activeIndex: 0 });
            tr.setMeta('addToHistory', false);
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FindHighlightState>({
        key: findReplaceHighlightKey,
        state: {
          init: () => ({ matches: [], activeIndex: 0 }),
          apply: (tr, prev) => {
            const meta = tr.getMeta(findReplaceHighlightKey) as FindHighlightState | undefined;
            if (meta) {
              return {
                matches: Array.isArray(meta.matches) ? meta.matches : [],
                activeIndex: typeof meta.activeIndex === 'number' ? meta.activeIndex : 0,
              };
            }
            if (tr.docChanged && prev.matches.length > 0) {
              const mapped = prev.matches
                .map((m) => ({
                  from: tr.mapping.map(m.from, 1),
                  to: tr.mapping.map(m.to, -1),
                }))
                .filter((m) => m.from < m.to);
              return {
                matches: mapped,
                activeIndex: Math.min(prev.activeIndex, Math.max(0, mapped.length - 1)),
              };
            }
            return prev;
          },
        },
        props: {
          decorations: (state) => {
            const pluginState = findReplaceHighlightKey.getState(state);
            if (!pluginState || pluginState.matches.length === 0) {
              return DecorationSet.empty;
            }
            const maxPos = state.doc.content.size;
            const decorations: Decoration[] = [];
            pluginState.matches.forEach((m, idx) => {
              const from = Math.max(0, Math.min(m.from, maxPos));
              const to = Math.max(from, Math.min(m.to, maxPos));
              if (to <= from) return;
              const isActive = idx === pluginState.activeIndex;
              decorations.push(
                Decoration.inline(
                  from,
                  to,
                  isActive
                    ? {
                        class: 'docium-find-match docium-find-match-active',
                        'data-docium-active-match': 'true',
                      }
                    : {
                        class: 'docium-find-match',
                      }
                )
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

