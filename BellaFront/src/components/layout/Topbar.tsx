import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import "./Topbar.css";

export function Topbar() {
  return (
    <header className="topbar">
      <div />
      <div className="topbar__actions">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
