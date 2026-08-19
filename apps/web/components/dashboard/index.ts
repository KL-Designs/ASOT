/* ============================================================================
   ASOT — Dashboard component kit

   `import { Panel, Badge, Meter } from '@/components/dashboard'`

   The kit exists because the dashboard's real problem is systemic rather than
   per-screen: **every panel is outlined in red**, so the container, the primary
   action, the destructive action and the alert state all carry the same weight
   and none of them reads as urgent. Depth now comes from a four-step surface
   scale, and red is spent only on action, active state and alert.

   Everything is scoped to `.dash` on the shell root — see
   styles/dashboard.module.css for the tokens and the reasoning behind each
   component's shape.

   Rules the set depends on:
     · One primary button per view. Destructive stays outlined until hover.
     · A panel takes a coloured edge only when its own state warrants one.
     · Status uses one palette everywhere: live / warn / alert / info / muted.
     · Anything irreversible goes through ConfirmDialog with a typed word.
     · An empty state is the size of its content and offers the action that
       fills it.
   ========================================================================== */

export {
    Panel, PanelHeader, PanelBody, PanelFooter,
    SectionLabel, PageHead, Grid2, Grid3, Stack,
    type PanelTone,
} from './surfaces'

export {
    Button, Chip, ChipRow, Switch,
    Field, Input, Textarea, Select,
    Stepper, PointsLine,
    type ButtonVariant,
} from './controls'

export {
    Badge, Meter, Stats, Stat,
    type Tone,
} from './status'

export {
    ListRow, Rows, Thumb,
    Table, TableScroll, cell,
    Identity, EmptyState, Tabs,
    type RowState,
} from './data'

export {
    ToolCard, ToolGrid,
    type ToolTier,
} from './tools'

export {
    ConfirmDialog, ToastProvider, useToast, SaveBar,
} from './feedback'

export * as DashIcons from './icons'
