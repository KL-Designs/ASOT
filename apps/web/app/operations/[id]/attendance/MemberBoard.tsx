import dayjs from 'dayjs'
import { rgbTriplet } from '@/lib/colour'
import AttendanceBoard from '@/components/operations/board/AttendanceBoard'
import OperationBar from '../OperationBar'
import HideSiteNav from '@/components/HideSiteNav'

interface Props {
    operationId: string
    title: string
    status?: string
    themeColor?: string
    date: Date | null
    myUserId: string
}

/**
 * The Attendance tab as a member sees it.
 *
 * Staff get the editor shell on this route; a member gets this — the same board
 * in its read-and-claim mode, under the same operation bar, and nothing else.
 * Rendering the editor for them would mount a Hocuspocus socket, a mission deck
 * and a document rail to show one panel they can use.
 *
 * The board is where a member RSVPs and takes a position. It used to sit at the
 * bottom of the orders page; the Modern rebuild moved it behind this tab and
 * put one call to action in its place, which only works if the tab opens.
 * `canManage` is false by construction — this file is the branch a viewer
 * *without* those rights fell through to.
 */
export default function MemberBoard({ operationId, title, status, themeColor, date, myUserId }: Props) {
    const accent = themeColor || '#db001d'

    return (
        <div
            className='command'
            style={{
                ['--acc' as string]: accent,
                ['--acc-rgb' as string]: rgbTriplet(accent),
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100%',
                background: 'var(--bg)',
            }}
        >
            <HideSiteNav />
            <OperationBar
                operationId={operationId}
                title={title}
                status={status}
                themeColor={themeColor}
                active='attendance'
                canEdit={false}
                access={{ attendance: true }}
            />

            <AttendanceBoard
                operationId={operationId}
                operationName={title || 'Operation'}
                operationWhen={date ? dayjs(date).format('ddd D MMM · HH:mm') : 'No date set'}
                myUserId={myUserId}
                canManage={false}
            />
        </div>
    )
}
