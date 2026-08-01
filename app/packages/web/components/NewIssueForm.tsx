'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CreateIssueInput, type Priority } from '@ma/shared';
import {
  useAgents,
  useAgentsReadinessMap,
  useCreateIssue,
  useProjects,
  useSettingsStatus,
  useSquads,
} from '@/lib/api';
import { confirmDialog } from '@/lib/confirm-store';
import {
  clearDraft,
  draftKey,
  readJsonDraft,
  writeJsonDraft,
  type NewIssueDraft,
} from '@/lib/draft-storage';
import { validateWith, type FieldErrors } from '@/lib/form-validation';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { FieldError } from './FieldError';
import { Icon } from './Icon';
import { Select } from './Select';

type ExecPreview =
  | { kind: 'isolated'; reason: 'no_project' | 'no_path'; projectTitle?: string; projectId?: string }
  | { kind: 'project_local'; path: string; projectTitle: string; projectId: string }
  | { kind: 'invalid_path'; path: string; projectTitle: string; projectId: string };

// S12：内联表单升级——可指派 agent/squad；侧栏 /?new=1 触发展开
// issue-cwd-gate：有指派且 cwd 未就绪时警告（与快速派活对齐）
// A1 UX Trust：可选 project + 执行目录预检（隔离 / 项目本机 / 路径无效）
const NEW_ISSUE_DRAFT_DEBOUNCE_MS = 300;

function isPriority(v: string): v is Priority {
  return (
    v === 'none' ||
    v === 'low' ||
    v === 'medium' ||
    v === 'high' ||
    v === 'urgent'
  );
}

export function NewIssueForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('none');
  const [assigneeValue, setAssigneeValue] = useState('');
  const [projectId, setProjectId] = useState('');
  const [customFields, setCustomFields] = useState<{k: string; v: string}[]>([]);
  // W3：提交前 Zod 校验（CreateIssueInput）产生的字段级错误
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement | null>(null);
  const draftReadyRef = useRef(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const create = useCreateIssue();
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const { data: projects = [] } = useProjects();
  const { data: settings } = useSettingsStatus();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const agentIds = useMemo(() => agents.map((a) => a.id), [agents]);
  const { data: readinessMap = {} } = useAgentsReadinessMap(agentIds);

  // 策略 A：open 时对 form 轻量 trap（非 modal，仍限制 Tab 循环 + Esc 关闭）
  useFocusTrap(open, formRef, {
    onEscape: () => setOpen(false),
    restoreFocus: true,
    autoFocus: true,
  });

  const projectFromUrl = searchParams.get('project') ?? '';

  // Slice 45：mount 恢复草稿（不恢复 open）
  useEffect(() => {
    const saved = readJsonDraft<NewIssueDraft>(draftKey.newIssue);
    if (saved) {
      if (typeof saved.title === 'string') setTitle(saved.title);
      if (typeof saved.priority === 'string' && isPriority(saved.priority)) {
        setPriority(saved.priority);
      }
      if (typeof saved.assigneeValue === 'string') setAssigneeValue(saved.assigneeValue);
      if (typeof saved.projectId === 'string' && !projectFromUrl) {
        setProjectId(saved.projectId);
      }
      if (Array.isArray(saved.customFields)) {
        setCustomFields(
          saved.customFields
            .filter((f) => f && typeof f.k === 'string' && typeof f.v === 'string')
            .map((f) => ({ k: f.k, v: f.v })),
        );
      }
    }
    draftReadyRef.current = true;
    // 仅 mount 恢复一次
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectFromUrl 仅首帧读
  }, []);

  // Slice 45：字段变更 debounce 写盘（不写 open）
  useEffect(() => {
    if (!draftReadyRef.current) return;
    if (draftTimerRef.current != null) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const payload: NewIssueDraft = {
        title,
        priority,
        assigneeValue,
        projectId,
        customFields,
      };
      // 全空则清掉，避免脏 key
      const empty =
        !title.trim() &&
        priority === 'none' &&
        !assigneeValue &&
        !projectId &&
        customFields.every((f) => !f.k.trim() && !f.v.trim());
      if (empty) clearDraft(draftKey.newIssue);
      else writeJsonDraft(draftKey.newIssue, payload);
      draftTimerRef.current = null;
    }, NEW_ISSUE_DRAFT_DEBOUNCE_MS);
    return () => {
      if (draftTimerRef.current != null) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [title, priority, assigneeValue, projectId, customFields]);

  const cwdBlocked = useMemo(() => {
    const cwd = settings?.checks?.find((c) => c.id === 'cwd');
    return cwd?.status === 'error';
  }, [settings]);
  const cwdDetail = useMemo(() => {
    const cwd = settings?.checks?.find((c) => c.id === 'cwd');
    return cwd?.detail ?? '未配置 MA_WORKSPACE_CWD';
  }, [settings]);
  const willEnqueue = Boolean(assigneeValue);
  const showCwdWarn = cwdBlocked && willEnqueue;

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  const execPreview: ExecPreview = useMemo(() => {
    if (!selectedProject) {
      return { kind: 'isolated', reason: 'no_project' };
    }
    const path = selectedProject.localPath?.trim() || '';
    if (!path) {
      return {
        kind: 'isolated',
        reason: 'no_path',
        projectTitle: selectedProject.title,
        projectId: selectedProject.id,
      };
    }
    if (selectedProject.localPathExists === false) {
      return {
        kind: 'invalid_path',
        path,
        projectTitle: selectedProject.title,
        projectId: selectedProject.id,
      };
    }
    return {
      kind: 'project_local',
      path,
      projectTitle: selectedProject.title,
      projectId: selectedProject.id,
    };
  }, [selectedProject]);

  const selectedAssignee = useMemo(() => {
    if (assigneeValue.startsWith('agent:')) {
      const id = assigneeValue.slice('agent:'.length);
      const ag = agents.find((a) => a.id === id);
      const rd = readinessMap[id];
      return {
        type: 'agent' as const,
        id,
        name: ag?.name ?? id,
        status: rd?.status,
        detail: rd?.detail,
      };
    }
    if (assigneeValue.startsWith('squad:')) {
      const id = assigneeValue.slice('squad:'.length);
      const sq = squads.find((s) => s.id === id);
      const leaderId = sq?.leaderId;
      const rd = leaderId ? readinessMap[leaderId] : undefined;
      return {
        type: 'squad' as const,
        id,
        name: sq?.name ?? id,
        status: rd?.status,
        detail: rd?.detail,
      };
    }
    return null;
  }, [assigneeValue, agents, squads, readinessMap]);

  const assigneeBlocked =
    selectedAssignee?.status != null &&
    selectedAssignee.status !== 'ready' &&
    selectedAssignee.status !== 'busy';

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete('new');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  // 看板 ?project= 筛选时预填表单（不删除 URL，保留筛选）
  useEffect(() => {
    if (projectFromUrl) setProjectId(projectFromUrl);
  }, [projectFromUrl]);

  function reset() {
    if (draftTimerRef.current != null) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    setTitle('');
    setPriority('none');
    setAssigneeValue('');
    setCustomFields([]);
    setFieldErrors({});
    if (!projectFromUrl) setProjectId('');
    setOpen(false);
    clearDraft(draftKey.newIssue);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();

    let assignee: CreateIssueInput['assignee'] = null;
    if (assigneeValue.startsWith('agent:')) {
      assignee = { type: 'agent', id: assigneeValue.slice('agent:'.length) };
    } else if (assigneeValue.startsWith('squad:')) {
      assignee = { type: 'squad', id: assigneeValue.slice('squad:'.length) };
    }

    const parsedCustomFields: Record<string, string> = {};
    customFields.forEach(({k, v}) => {
      const key = k.trim();
      const val = v.trim();
      if (key && val) {
        parsedCustomFields[key] = val;
      }
    });

    // W3：提交前用 CreateIssueInput 校验；不过则显示字段级 FieldError
    const validated = validateWith(CreateIssueInput, {
      title: title.trim(),
      priority,
      assignee,
      projectId: projectId || undefined,
      customFields:
        Object.keys(parsedCustomFields).length > 0 ? parsedCustomFields : undefined,
    });
    if (!validated.ok) {
      setFieldErrors(validated.errors);
      return;
    }

    // F8：指派硬闸（cwd/runtime/error）与服务端一致——禁止提交开工
    if (
      assigneeBlocked &&
      selectedAssignee &&
      (selectedAssignee.status === 'cwd_missing' ||
        selectedAssignee.status === 'runtime_missing' ||
        selectedAssignee.status === 'error')
    ) {
      void confirmDialog({
        title: '无法开工',
        description: `${selectedAssignee.name} 当前不可开工（${selectedAssignee.status}）。请先修复环境/运行时，或清空指派后再创建。`,
        confirmLabel: '知道了',
        hideCancel: true,
      });
      return;
    }

    create.mutate(validated.data, {
      onSuccess: () => reset(),
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-new-issue" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        新建 Issue
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      className="new-issue-form"
      onSubmit={submit}
      data-testid="new-issue-form"
    >
      {showCwdWarn ? (
        <div
          className="new-issue-cwd-banner"
          data-testid="new-issue-cwd-banner"
          role="status"
        >
          <span>
            <strong>工作区未就绪（已启用工作区 cwd）</strong>
            {cwdDetail} — MA_ISSUE_USE_WORKSPACE_CWD 开启时服务端拒绝开工；默认隔离不会出现此条。
          </span>
          <div className="new-issue-cwd-actions" data-testid="new-issue-cwd-actions">
            <Link href="/settings" className="btn-secondary btn-sm" data-testid="new-issue-settings">
              环境诊断
            </Link>
            <Link
              href="/agents?ready=cwd_missing"
              className="btn-ghost btn-sm"
              data-testid="new-issue-agents-cwd"
            >
              智能体 cwd
            </Link>
            <Link
              href="/runs?status=failed"
              className="btn-ghost btn-sm"
              data-testid="new-issue-failed-runs"
            >
              失败运行
            </Link>
          </div>
        </div>
      ) : null}

      <div
        className={
          'new-issue-exec-banner' +
          (execPreview.kind === 'invalid_path'
            ? ' is-bad'
            : execPreview.kind === 'project_local'
              ? ' is-ok'
              : ' is-warn')
        }
        data-testid="new-issue-exec-banner"
        data-mode={
          execPreview.kind === 'project_local'
            ? 'project_local'
            : execPreview.kind === 'invalid_path'
              ? 'invalid'
              : 'isolated'
        }
        role="status"
      >
        {execPreview.kind === 'isolated' && execPreview.reason === 'no_project' ? (
          <span>
            <strong>将在隔离目录执行</strong>
            未关联项目 — agent 不会改动业务仓。绑定项目并配置本机目录后，才在真仓跑。
          </span>
        ) : null}
        {execPreview.kind === 'isolated' && execPreview.reason === 'no_path' ? (
          <span>
            <strong>将在隔离目录执行</strong>
            项目「{execPreview.projectTitle}」未绑定本机目录。
          </span>
        ) : null}
        {execPreview.kind === 'invalid_path' ? (
          <span>
            <strong>项目路径无效</strong>
            「{execPreview.projectTitle}」· <code>{execPreview.path}</code>
            — 不存在或不是目录；指派后 run 会失败。
          </span>
        ) : null}
        {execPreview.kind === 'project_local' ? (
          <span>
            <strong>将在项目本机目录执行</strong>
            「{execPreview.projectTitle}」· <code>{execPreview.path}</code>
          </span>
        ) : null}
        <div className="new-issue-cwd-actions" data-testid="new-issue-exec-actions">
          {execPreview.kind === 'isolated' && execPreview.reason === 'no_project' ? (
            <Link href="/projects" className="btn-ghost btn-sm" data-testid="new-issue-projects">
              项目列表
            </Link>
          ) : null}
          {(execPreview.kind === 'isolated' && execPreview.reason === 'no_path') ||
          execPreview.kind === 'invalid_path' ||
          execPreview.kind === 'project_local' ? (
            <Link
              href={`/projects/${execPreview.projectId}`}
              className="btn-secondary btn-sm"
              data-testid="new-issue-project-detail"
            >
              {execPreview.kind === 'project_local' ? '项目详情' : '绑定本机目录'}
            </Link>
          ) : null}
        </div>
      </div>

      <input
        className="new-issue-input"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setFieldErrors((prev) => (prev.title ? { ...prev, title: '' } : prev));
        }}
        placeholder="标题"
        autoFocus
        data-testid="new-issue-title"
        aria-invalid={fieldErrors.title ? true : undefined}
        aria-describedby={fieldErrors.title ? 'new-issue-title-error' : undefined}
      />
      {fieldErrors.title ? (
        <FieldError id="new-issue-title-error" message={fieldErrors.title} dataTestId="new-issue-title-error" />
      ) : null}
      <Select
        className="new-issue-select"
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
        aria-label="优先级"
        data-testid="new-issue-priority"
      >
        <option value="none">无</option>
        <option value="low">低</option>
        <option value="medium">中</option>
        <option value="high">高</option>
        <option value="urgent">紧急</option>
      </Select>
      <Select
        className="new-issue-select new-issue-project"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        aria-label="所属项目"
        data-testid="new-issue-project"
      >
        <option value="">无项目（隔离执行）</option>
        {projects.map((p) => {
          const pathHint = p.localPath
            ? p.localPathExists
              ? ' · 已绑目录'
              : ' · 路径无效'
            : ' · 未绑目录';
          return (
            <option key={p.id} value={p.id}>
              {p.title}
              {pathHint}
            </option>
          );
        })}
      </Select>
      <Select
        className="new-issue-select new-issue-assignee"
        value={assigneeValue}
        onChange={(e) => setAssigneeValue(e.target.value)}
        aria-label="指派 agent 或小队"
        data-testid="new-issue-assignee"
      >
        <option value="">未指派</option>
        <optgroup label="智能体">
          {agents.map((a) => {
            const st = readinessMap[a.id]?.status;
            const hint = st && st !== 'ready' && st !== 'busy' ? ` · ${st}` : '';
            return (
              <option key={a.id} value={`agent:${a.id}`}>
                {a.name} · {a.runtime}
                {hint}
              </option>
            );
          })}
        </optgroup>
        <optgroup label="小队">
          {squads.map((s) => {
            const st = s.leaderId ? readinessMap[s.leaderId]?.status : undefined;
            const hint =
              st && st !== 'ready' && st !== 'busy' ? ` · 队长 ${st}` : '';
            return (
              <option key={s.id} value={`squad:${s.id}`}>
                {s.name}
                {hint}
              </option>
            );
          })}
        </optgroup>
      </Select>
      <div className="new-issue-custom-fields mb-2" data-testid="new-issue-custom-fields">
        {customFields.length > 0 && (
          <div className="text-xs font-medium text-slate-600 mb-1">自定义字段</div>
        )}
        {customFields.map((field, idx) => (
          <div key={idx} className="flex gap-2 mb-1" data-testid={`new-issue-custom-field-row-${idx}`}>
            <input
              className="new-issue-input flex-1"
              placeholder="字段名 (例如: 环境)"
              value={field.k}
              onChange={(e) => {
                const copy = [...customFields];
                copy[idx].k = e.target.value;
                setCustomFields(copy);
              }}
              data-testid={`new-issue-custom-field-key-${idx}`}
            />
            <input
              className="new-issue-input flex-1"
              placeholder="字段值 (例如: Staging)"
              value={field.v}
              onChange={(e) => {
                const copy = [...customFields];
                copy[idx].v = e.target.value;
                setCustomFields(copy);
              }}
              data-testid={`new-issue-custom-field-val-${idx}`}
            />
            <button
              type="button"
              className="btn-ghost px-2 text-red-500 text-xs"
              onClick={() => {
                const copy = [...customFields];
                copy.splice(idx, 1);
                setCustomFields(copy);
              }}
              title="删除字段"
              data-testid={`new-issue-remove-custom-field-${idx}`}
            >
              ×
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <button
            type="button"
            className="btn-ghost btn-sm text-xs"
            onClick={() => setCustomFields([...customFields, { k: '', v: '' }])}
            data-testid="new-issue-add-custom-field"
          >
            + 添加自定义字段
          </button>
          <div className="flex gap-1 items-center text-xs text-dim">
            <span>常用:</span>
            {['环境', '影响版本', '模块', 'JiraID'].map((preset) => (
              <button
                key={preset}
                type="button"
                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 text-xs transition-colors"
                onClick={() => {
                  const emptyIdx = customFields.findIndex((f) => !f.k.trim());
                  if (emptyIdx >= 0) {
                    const copy = [...customFields];
                    copy[emptyIdx].k = preset;
                    setCustomFields(copy);
                  } else {
                    setCustomFields([...customFields, { k: preset, v: '' }]);
                  }
                }}
                data-testid={`new-issue-preset-${preset}`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </div>
      {selectedAssignee && assigneeBlocked ? (
        <div
          className="new-issue-assignee-banner"
          data-testid="new-issue-assignee-banner"
          data-status={selectedAssignee.status ?? 'unknown'}
          role="status"
        >
          <span>
            <strong>指派方可能无法执行</strong>
            {selectedAssignee.type === 'agent' ? '智能体' : '小队队长'}「
            {selectedAssignee.name}」：{selectedAssignee.status}
            {selectedAssignee.detail ? ` · ${selectedAssignee.detail}` : ''}
          </span>
          <div className="new-issue-cwd-actions" data-testid="new-issue-assignee-actions">
            {selectedAssignee.status === 'runtime_missing' ? (
              <Link
                href="/runtimes"
                className="btn-secondary btn-sm"
                data-testid="new-issue-assignee-runtimes"
              >
                运行时
              </Link>
            ) : (
              <Link
                href="/settings"
                className="btn-secondary btn-sm"
                data-testid="new-issue-assignee-settings"
              >
                环境
              </Link>
            )}
            <Link
              href={
                selectedAssignee.type === 'agent'
                  ? `/agents/${selectedAssignee.id}`
                  : `/squads/${selectedAssignee.id}`
              }
              className="btn-ghost btn-sm"
              data-testid="new-issue-assignee-detail"
            >
              详情
            </Link>
            {selectedAssignee.status ? (
              <Link
                href={
                  selectedAssignee.type === 'agent'
                    ? `/agents?ready=${encodeURIComponent(selectedAssignee.status)}`
                    : `/squads?ready=${encodeURIComponent(selectedAssignee.status)}`
                }
                className="btn-ghost btn-sm"
                data-testid="new-issue-assignee-same"
              >
                同态列表
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      <button
        type="submit"
        className="btn-primary"
        data-testid="new-issue-submit"
        data-cwd-blocked={showCwdWarn ? '1' : '0'}
        data-assignee-blocked={assigneeBlocked ? '1' : '0'}
        data-exec-mode={
          execPreview.kind === 'project_local'
            ? 'project_local'
            : execPreview.kind === 'invalid_path'
              ? 'invalid'
              : 'isolated'
        }
        title={
          showCwdWarn
            ? '工作区未就绪时服务端拒绝开工'
            : assigneeBlocked
              ? '指派方可能无法执行'
              : execPreview.kind === 'invalid_path'
                ? '项目路径无效，指派后 run 可能失败'
                : execPreview.kind === 'isolated'
                  ? '将在隔离目录执行（不会改动业务仓）'
                  : undefined
        }
        // W3：校验错误用 FieldError 展示，按钮只在提交中禁用
        disabled={create.isPending}
      >
        {create.isPending
          ? '提交中…'
          : showCwdWarn || assigneeBlocked
            ? '仍要创建'
            : '提交'}
      </button>
      <button type="button" className="btn-ghost" onClick={reset}>
        取消
      </button>
    </form>
  );
}
