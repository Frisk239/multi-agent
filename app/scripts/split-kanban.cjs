// O4 手术：KanbanBoard.tsx 拆 shared/dnd/toolbar 后主组件重拼
const fs = require('fs');
const p = 'packages/web/components/KanbanBoard.tsx';
const lines = fs.readFileSync(p, 'utf8').split('\n');

const newImports = `import {
  PRIORITY_OPTIONS,
  COLUMNS,
  kanbanKeyboardCoordinates,
  parseAssigneeParam,
  type KanbanScopeFilter,
} from './KanbanBoard.shared';
import { computeDragReorder } from './KanbanBoard.dnd';
import { KanbanToolbar } from './KanbanBoard.toolbar';
`;

const newDragEnd = `  function handleDragEnd(event: any) {
    const result = computeDragReorder(event, issues ?? []);
    setDragId(null);
    if (result) {
      reorder.mutate(result);
    }
  }`;

const toolbarCall = `      <KanbanToolbar
        selectValue={selectValue}
        setAssigneeFilter={setAssigneeFilter}
        agents={agents}
        squads={squads}
        qDraft={qDraft}
        setQDraft={setQDraft}
        qFromUrl={qFromUrl}
        searchParams={searchParams}
        viewMode={viewMode}
        setViewMode={setViewMode}
        sortMode={sortMode}
        setSortMode={setSortMode}
        quickCreate={quickCreate}
        showMore={showMore}
        setMoreFiltersOpen={setMoreFiltersOpen}
        moreFilterCount={moreFilterCount}
        density={density}
        setDensity={setDensity}
        priorityQuery={priorityQuery}
        setPriorityFilter={setPriorityFilter}
        originQuery={originQuery}
        setOriginFilter={setOriginFilter}
        projectFromUrl={projectFromUrl}
        setProjectFilter={setProjectFilter}
        projects={projects}
        statusQuery={statusQuery}
        setStatusFilter={setStatusFilter}
        failedOnly={failedOnly}
        setFailedOnly={setFailedOnly}
        failedCount={failedCount}
        visibleCount={visibleCount}
        labelFilter={labelFilter}
        setLabelFilter={setLabelFilter}
        labels={labels}
        importFileRef={importFileRef}
        handleImportFile={handleImportFile}
        handleExportJson={handleExportJson}
        jsonNotice={jsonNotice}
        assigneeChipLabel={assigneeChipLabel}
        labelChipName={labelChipName}
        priorityChip={priorityChip}
        statusChipLabel={statusChipLabel}
        projectChipName={projectChipName}
        hasActiveFilters={hasActiveFilters}
        router={router}
        pathname={pathname}
      />`;

// 区间（0-based）：[head 1-62] [shared 63-194 删] [inner 195-819] [drag 820-897 替换] [chips 898-931] [toolbar 932-1421 替换] [tail 1422-end]
const head = lines.slice(0, 62).join('\n');
const inner = lines.slice(194, 819).join('\n');
const chipsSection = lines.slice(897, 931).join('\n');
const tail = lines.slice(1421).join('\n');

const out = `${head}
${newImports}
${inner}

${newDragEnd}

${chipsSection}

${toolbarCall}

${tail}
`;
fs.writeFileSync(p, out);
console.log('patched; new line count:', out.split('\n').length);
