import './ActivityFeed.css';

export interface ActivityEntry {
  id: string;
  time: string;
  text: string;
  kind: 'info' | 'success' | 'warning' | 'ambient';
}

const DOT_CLASS: Record<ActivityEntry['kind'], string> = {
  info: 'activity__dot--info',
  success: 'activity__dot--success',
  warning: 'activity__dot--warning',
  ambient: 'activity__dot--ambient',
};

export default function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="activity">
      <div className="activity__header">
        <h2 className="activity__title">Event feed</h2>
        <span className="activity__live-dot" />
      </div>
      <div className="activity__list">
        {entries.length === 0 && <div className="activity__empty">No events yet. Park a car or connect the board.</div>}
        {entries.map((e) => (
          <div className="activity__row" key={e.id}>
            <span className={`activity__dot ${DOT_CLASS[e.kind]}`} />
            <span className="activity__text">{e.text}</span>
            <span className="activity__time">{e.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
