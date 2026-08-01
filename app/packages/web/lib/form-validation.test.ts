import { describe, expect, it } from 'vitest';
import {
  CreateAutomationRuleInput,
  CreateIssueInput,
  CreateSquadInput,
  UpdateAgentInput,
} from '@ma/shared';
import { FORM_LEVEL_ERROR_KEY, fieldError, validateWith } from './form-validation';

describe('validateWith', () => {
  it('ok 分支：合法数据返回解析结果（含 default 填充）', () => {
    const res = validateWith(CreateIssueInput, {
      title: '写测试',
      priority: 'high',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.title).toBe('写测试');
      // 缺省字段按 schema default 填充
      expect(res.data.priority).toBe('high');
      expect(res.data.assignee).toBeNull();
    }
  });

  it('errors 分支：单字段错误带字段级 key', () => {
    const res = validateWith(CreateIssueInput, { title: '' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.title).toBeTruthy();
    }
  });

  it('errors 分支：多字段错误逐字段给出', () => {
    const res = validateWith(CreateSquadInput, { name: '', leaderId: '' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.name).toBeTruthy();
      expect(res.errors.leaderId).toBeTruthy();
    }
  });

  it('同字段多条 issue 只保留第一条（基础校验先于 superRefine）', () => {
    // dailyTime 同时触发 regex（基础）与 superRefine 必填；保留第一条
    const res = validateWith(CreateAutomationRuleInput, {
      name: 'rule',
      scheduleKind: 'daily_at',
      dailyTime: '',
      assigneeType: 'agent',
      assigneeId: 'agt-1',
      titleTemplate: 'tpl',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.dailyTime).toBe('Invalid');
    }
  });

  it('嵌套 path 映射到第一段字段', () => {
    const res = validateWith(CreateIssueInput, {
      title: 'ok',
      assignee: { type: 'agent', id: '' },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      // assignee.id 的报错归到 assignee 字段
      expect(res.errors.assignee).toBeTruthy();
      expect(res.errors.assigneeId).toBeUndefined();
    }
  });

  it('superRefine 自定义错误（CreateAutomationRuleInput 调度字段）', () => {
    const res = validateWith(CreateAutomationRuleInput, {
      name: 'rule',
      scheduleKind: 'cron',
      cronExpression: '',
      assigneeType: 'agent',
      assigneeId: 'agt-1',
      titleTemplate: 'tpl',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.cronExpression).toBeTruthy();
    }
  });

  it('顶层（非字段级）错误落到 _form', () => {
    // UpdateAgentInput 的 refine('empty patch') 挂在对象顶层（path=[]）
    const res = validateWith(UpdateAgentInput, {});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[FORM_LEVEL_ERROR_KEY]).toBe('empty patch');
      expect(res.errors.a).toBeUndefined();
    }
  });

  it('ok 分支返回类型安全 data（可作 mutate 入参）', () => {
    const res = validateWith(CreateIssueInput, { title: 'abc' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(typeof res.data.title).toBe('string');
    }
  });
});

describe('fieldError', () => {
  it('有错误时返回文案，无错误返回 null', () => {
    expect(fieldError({ title: '标题不能为空' }, 'title')).toBe('标题不能为空');
    expect(fieldError({ title: '标题不能为空' }, 'priority')).toBeNull();
    expect(fieldError(null, 'title')).toBeNull();
    expect(fieldError(undefined, 'title')).toBeNull();
  });
});

describe('FORM_LEVEL_ERROR_KEY', () => {
  it('导出 _form 常量供表单级提示使用', () => {
    expect(FORM_LEVEL_ERROR_KEY).toBe('_form');
  });
});
