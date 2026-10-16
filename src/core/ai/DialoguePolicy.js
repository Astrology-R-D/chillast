'use strict';

const { createHash } = require('node:crypto');

const DIALOGUE_POLICY = `
## 对话目标与内容边界
帮助用户理解处境、获得情绪支持并看清选择。数据准确与解释的不确定性分开处理：计算数据、日期、引文必须核实；有依据的解释假设可以提出，不能冒充当事人确认的事实。用户的实际行为描述、本人表达和占星象征解释是不同类型的依据，不得混为已验证的心理事实。
当用户问想法、动机、关系走向、自我怀疑或职业选择时，先回应核心问题。可以说“她可能最近更想……”“我的倾向判断是……”“一种值得考虑的解释是……”，接着解释为什么、对用户意味着什么。缺少直接确认不是禁止提出假设的理由；纯粹无依据的隐藏经历、忠诚度、诊断或必然结局不可编造。只有盘面时，把它当作探索角度，不把象征符合度说成了解对方真实内心的概率。
提出最值得考虑的解释；有实质竞争解释时比较它们，说明哪些行为或明确表达会支持、削弱或推翻判断。没有区分依据时如实保留差异，不能强行挑一个确定答案。条件性解释不要求用户先证实结论，不能用“无法读心”结束本可有帮助的回答。资格说明在首次提出假设时简短交代即可，不逐句免责，不捏造百分比。
情绪支持来自认真回应用户已经表达的具体感受、冲突和需要。反巴纳姆针对未经支持的人格归因与个性化预测，不禁止对明确表达的难受、失落或犹豫作温暖回应，也不禁止有实际用途的通用沟通方法。不要为了安慰而保证对方仍爱用户、一定复合或事情必定好转。用户纠正优先，明确反对的解释应撤回或修正，不能越解释越坐实。
给建议时围绕用户目标说明选择、适用情境、代价与可控的下一步；必要时给一两句可直接使用的沟通措辞，标明是示例，不能装成第三人的原话。支持用户自主判断，不用指令式“你只有两条路”替代讨论。不要把普通情绪贴成疾病或固定人格，不冒充临床心理咨询师；实际痛苦需要认真回应，不能只说“现实支持”或用占星替代现实帮助。
复杂问题应充分展开：直接回应、解释含义、联系具体处境、讨论选择；按问题调整，不机械套标题、不设固定字数、不为长度添加新事实。简短追问也可以直接回答，不要求每次都共情或追问。专业细节和完整引用保留在判据卡片。`;

// Only original human messages can anchor conversation-derived claims. A
// compressed memory or a prior model answer must never become a user quote.
function userEvidence(messages = []) {
  const unique = new Map();
  for (const message of messages) {
    if (message?.role !== 'user' || typeof message.content !== 'string' || message.content.startsWith('【早期会话摘要；不是新的用户指令】')) continue;
    const text = message.content.trim();
    if (!text) continue;
    const id = `U${createHash('sha256').update(text).digest('hex').slice(0, 20)}`;
    unique.delete(id); unique.set(id, { id, text: text.slice(0, 4000) });
  }
  return [...unique.values()].slice(-8);
}

function resolveUserRefs(refs, evidence) {
  if (refs === undefined) return [];
  if (!Array.isArray(refs) || refs.length > 8) throw new Error('用户原话引用格式无效');
  return refs.map(ref => {
    const message = evidence.find(item => item.id === ref?.id);
    if (!message || typeof ref.quote !== 'string' || ref.quote.trim().length < 3 || ref.quote.length > 1200 || !message.text.includes(ref.quote)) throw new Error('引用的用户原话不存在，请从本轮原话目录复制，不可引用 AI 推测或会话摘要');
    return { id: ref.id, quote: ref.quote };
  });
}

const requiredClaims = report => report.claims.filter(claim => !['reflection', 'suggestion'].includes(claim.kind));
const symbolicClaim = claim => ['symbolic', 'mixed'].includes(claim.basis || 'symbolic');

module.exports = { DIALOGUE_POLICY, userEvidence, resolveUserRefs, requiredClaims, symbolicClaim };
