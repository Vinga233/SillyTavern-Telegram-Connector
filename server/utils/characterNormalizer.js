// utils/characterNormalizer.js
// 角色卡数据标准化器
//
// 兼容 SillyTavern 新旧两种角色卡格式：
//   旧格式（V1）：char.name, char.description, char.first_mes ...
//   新格式（V2）：char.data.name, char.data.description, char.data.first_mes ...
//               char.alternate_greetings → char.data.alternate_greetings
//
// 统一输出结构化角色卡，供 Telegram UI 使用。

'use strict';

class CharacterNormalizer {
    normalize(raw) {
        if (!raw || typeof raw !== 'object') {
            return this._emptyCard();
        }
        const d = raw.data || {};
        return {
            metadata: this._buildMetadata(raw, d),
            profile: this._buildProfile(raw, d),
            conversation: this._buildConversation(raw, d),
            advanced: this._buildAdvanced(raw, d),
        };
    }

    _buildMetadata(raw, d) {
        return {
            name: this._pick(raw, d, 'name', ''),
            creator: this._pick(raw, d, 'creator', d.creator || raw.creatorcomment || ''),
            character_version: d.character_version || d.characterVersion || '',
            avatar: raw.avatar || '',
            create_date: raw.create_date || '',
            fav: !!raw.fav,
            talkativeness: raw.talkativeness ?? null,
            tags: this._pick(raw, d, 'tags', []),
        };
    }

    _buildProfile(raw, d) {
        return {
            description: this._pick(raw, d, 'description', ''),
            personality: this._pick(raw, d, 'personality', ''),
            scenario: this._pick(raw, d, 'scenario', ''),
            creator_notes: d.creator_notes || d.creatorNotes || raw.creatorcomment || '',
            mes_example: this._pick(raw, d, 'mes_example', ''),
        };
    }

    _buildConversation(raw, d) {
        const alternateGreetings = this._collectAlternateGreetings(raw, d);
        const firstMes = this._pick(raw, d, 'first_mes', '');
        return {
            first_mes: firstMes,
            alternate_greetings: alternateGreetings,
            alternate_greeting_count: alternateGreetings.length,
            selected_greeting: this._pick(raw, d, 'selected_greeting', d.selectedGreeting ?? 0),
        };
    }

    _collectAlternateGreetings(raw, d) {
        const newGreetings = d.alternate_greetings || d.alternateGreetings;
        if (Array.isArray(newGreetings) && newGreetings.length > 0) {
            return newGreetings.map((g, i) => ({
                id: i,
                text: typeof g === 'string' ? g : (g.text || ''),
            }));
        }
        if (Array.isArray(raw.alternate_greetings) && raw.alternate_greetings.length > 0) {
            return raw.alternate_greetings.map((g, i) => ({
                id: i,
                text: typeof g === 'string' ? g : (g.text || ''),
            }));
        }
        const firstMes = this._pick(raw, d, 'first_mes', '');
        return firstMes ? [{ id: 0, text: firstMes }] : [];
    }

    _buildAdvanced(raw, d) {
        return {
            system_prompt: this._pick(raw, d, 'system_prompt', ''),
            post_history_instructions: this._pick(raw, d, 'post_history_instructions', ''),
            creator_notes: d.creator_notes || d.creatorNotes || '',
            extensions: d.extensions || {},
            json_data: raw.json_data || '',
        };
    }

    _pick(raw, d, key, fallback) {
        if (d[key] !== undefined && d[key] !== null) return d[key];
        if (raw[key] !== undefined && raw[key] !== null) return raw[key];
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (d[camelKey] !== undefined && d[camelKey] !== null) return d[camelKey];
        if (raw[camelKey] !== undefined && raw[camelKey] !== null) return raw[camelKey];
        return fallback;
    }

    _emptyCard() {
        return {
            metadata: { name: '', creator: '', character_version: '', avatar: '', create_date: '', fav: false, talkativeness: null, tags: [] },
            profile: { description: '', personality: '', scenario: '', creator_notes: '', mes_example: '' },
            conversation: { first_mes: '', alternate_greetings: [], alternate_greeting_count: 0, selected_greeting: 0 },
            advanced: { system_prompt: '', post_history_instructions: '', creator_notes: '', extensions: {}, json_data: '' },
        };
    }

    formatTelegramText(card, opts) {
        opts = opts || {};
        const maxLen = opts.maxLength || 4000;
        if (!card || !card.metadata) return '未找到角色数据';

        const lines = [];
        const m = card.metadata;
        const p = card.profile;
        const c = card.conversation;

        lines.push('\uD83C\uDFAD ' + (m.name || '未知角色'));
        if (m.creator) lines.push('\uD83D\uDC64 作者: ' + m.creator);
        if (m.character_version) lines.push('\uD83D\uDCCC 版本: ' + m.character_version);
        if (m.talkativeness !== null) lines.push('\uD83D\uDCAC 话痨值: ' + m.talkativeness);
        if (m.tags && m.tags.length > 0) lines.push('\uD83C\uDFF7\uFE0F 标签: ' + m.tags.join(', '));
        lines.push('');

        if (p.description) {
            lines.push('\uD83D\uDCDD 描述');
            lines.push(this._truncate(p.description, 300));
            lines.push('');
        }
        if (p.personality) {
            lines.push('\uD83C\uDFAD 性格');
            lines.push(this._truncate(p.personality, 300));
            lines.push('');
        }
        if (p.scenario) {
            lines.push('\uD83C\uDF0D 场景');
            lines.push(this._truncate(p.scenario, 300));
            lines.push('');
        }
        if (p.mes_example) {
            lines.push('\uD83D\uDCA1 示例对话');
            lines.push(this._truncate(p.mes_example, 500));
            lines.push('');
        }
        if (c.first_mes) {
            lines.push('\uD83D\uDCAC 开场白');
            lines.push(this._truncate(c.first_mes, 500));
        }
        if (c.alternate_greeting_count > 1) {
            lines.push('\uD83D\uDD04 可选开场白: ' + c.alternate_greeting_count + ' 个');
        }

        let text = lines.join('\n');
        if (text.length > maxLen) {
            text = text.substring(0, maxLen - 100) + '\n\n...（内容过长已截断）';
        }
        return text;
    }

    _truncate(str, maxLen) {
        if (!str) return '';
        if (str.length <= maxLen) return str;
        return str.substring(0, maxLen) + '\n\n...（已截断）';
    }
}

module.exports = new CharacterNormalizer();
