import { NavLink } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-brand">Compliance Portal</div>
      <div className="navbar-links">
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/evidence">Evidence</NavLink>
        <NavLink to="/submit">Submit</NavLink>
        <NavLink to="/history">History</NavLink>
        <NavLink to="/agent">Agent</NavLink>
      </div>
    </nav>
  );
}
