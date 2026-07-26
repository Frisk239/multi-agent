# Implement Frontend for Issue Custom Fields

## 变动总结

- **UI Component**: Created `packages/web/components/IssueCustomFields.tsx` to handle viewing, adding, and deleting custom key-value attributes for an Issue. It maps over the `customFields` object and renders them beautifully with an edit toggle.
- **Integration**: Integrated `IssueCustomFields` at the end of the `propsBlock` inside `packages/web/components/IssueHeader.tsx`.
- **Form Support**: Added Custom Fields support to `packages/web/components/NewIssueForm.tsx`, allowing users to define these attributes upon Issue creation.
- **Backend Fixes**: Fixed a missing mapper in `packages/server/src/db/reshape.ts` to ensure `customFields` makes it correctly from the DB to the frontend DTO object.
- **Typecheck Pass**: Ensured `pnpm run typecheck` works fully (fixed unrelated typing errors in `seed-fixtures` and `run-event-pairs.test.ts`).

## 状态
该切片的前端与后端功能现已全部完成并联调通过，达成 0 TypeScript 类型报错。
