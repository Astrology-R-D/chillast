'use strict';

const ToolProvider = require('./ToolProvider');
const esm = require('../esm-bridge');

const GENDER_ZH = { male: '男', female: '女', other: '其他' };

function _summary(p) {
  const b = p.birthData || {};
  const loc = b.location || {};
  const g = GENDER_ZH[p.gender] || '未知';
  const time = `${b.year}年${b.month}月${b.day}日 ${b.hour}:${String(b.minute).padStart(2, '0')}`;
  return `${p.nameZh || p.nameEn || '未命名'}（性别${g}，${time}，${loc.label || ''}${loc.latitude != null ? `，${loc.latitude}°N ${loc.longitude}°E` : ''}）`;
}

/**
 * ProfileToolProvider — lets the agent look up saved profiles by name, not just
 * the currently-selected one. This is what enables "我是Chilliziehen，你能查到我的信息吗"
 * to be answered: the agent can search the repository instead of being limited
 * to the active selection.
 */
class ProfileToolProvider extends ToolProvider {
  constructor(profileRepository) {
    super('profiles', 'context');
    this._repo = profileRepository;
  }

  isReady() { return !!this._repo; }

  async _build() {
    if (!this.isReady()) return [];
    const { DynamicStructuredTool } = await esm.load('@langchain/core/tools');
    const z = require('zod');
    const repo = this._repo;

    const listProfiles = new DynamicStructuredTool({
      name: 'list_profiles',
      description:
        '列出工作站中所有已保存的档案（姓名、性别、出生信息）。无需参数。当用户问“我是谁”、按姓名询问、或当前未选中档案时，用它查找。',
      schema: z.object({}),
      func: async () => {
        const all = repo.list() || [];
        if (!all.length) return '工作站中还没有任何档案。';
        return all.map((p, i) => `${i + 1}. ${_summary(p)}`).join('\n');
      },
    });

    const findProfileByName = new DynamicStructuredTool({
      name: 'find_profile_by_name',
      description:
        '按姓名查找已保存的档案，返回其出生信息（姓名、性别、出生年月日时、出生地）。支持部分匹配。当用户报出姓名并询问其资料时使用。',
      schema: z.object({ name: z.string().describe('要查找的姓名，支持部分匹配，如“Chilliziehen”') }),
      func: async (input) => {
        const q = String(input.name || '').trim().toLowerCase();
        if (!q) return '请提供要查找的姓名。';
        const all = repo.list() || [];
        const matches = all.filter((p) =>
          (p.nameZh || '').toLowerCase().includes(q) || (p.nameEn || '').toLowerCase().includes(q));
        if (!matches.length) return `没有找到姓名包含“${input.name}”的档案。`;
        if (matches.length === 1) return _summary(matches[0]);
        return `找到 ${matches.length} 个匹配档案：\n${matches.map((p, i) => `${i + 1}. ${_summary(p)}`).join('\n')}`;
      },
    });

    return [listProfiles, findProfileByName];
  }
}

module.exports = ProfileToolProvider;
