import type { ReactNode } from 'react'
import type { Brief } from '@/lib/brief'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 border-b py-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

// Spark writes "unspecified" when the painter didn't say; that's no value to show.
const said = (v: string | null) => !!v && v !== 'unspecified'
const FromPicture = () => <span className="text-muted-foreground">From the picture</span>

// What Spark read from the painter's brief, field by field.
// When they asked for a picture painted as it is, its colors and mood come from that picture.
export function BriefDetails({ brief }: { brief: Brief }) {
  const { palette, room } = brief
  const tone = [palette.temperature, palette.intensity].filter(said).join(', ')
  const moods = [...brief.mood, ...brief.style]
  const asIs = !!brief.paint_as_is
  return (
    <dl className="flex flex-col">
      <Row label="Colors">
        {palette.colors.length === 0 && !tone && (asIs ? <FromPicture /> : '—')}
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {palette.colors.map(c => (
            <span key={c.name} className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ background: c.approx_hex }} />
              {c.name}
            </span>
          ))}
        </span>
        {(tone || palette.avoid.length > 0) && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {[tone, palette.avoid.length && `no ${palette.avoid.join(', ')}`].filter(Boolean).join(' · ')}
          </span>
        )}
      </Row>
      <Row label="Mood & style">{moods.join(', ') || (asIs ? <FromPicture /> : '—')}</Row>
      <Row label="Room">
        {[room.name, room.placement, room.wall_width_cm && `wall ${room.wall_width_cm} cm wide`].filter(Boolean).join(', ') || '—'}
        {room.wall_color_hex && (
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-3 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ background: room.wall_color_hex }} />
            Wall color from the photo
          </span>
        )}
      </Row>
    </dl>
  )
}
