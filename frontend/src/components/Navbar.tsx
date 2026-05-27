import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { label: "Dashboard", to: "/" },
  { label: "Evidence", to: "/evidence" },
  { label: "Submit", to: "/submit" },
  { label: "History", to: "/history" },
  { label: "Agent", to: "/agent" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AppBar position="sticky" color="primary" elevation={1}>
      <Toolbar>
        <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
          Compliance Portal
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {navItems.map(({ label, to }) => {
            const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <Button
                key={to}
                color="inherit"
                onClick={() => navigate(to)}
                sx={{
                  opacity: active ? 1 : 0.7,
                  borderBottom: active ? "2px solid white" : "2px solid transparent",
                  borderRadius: 0,
                }}
              >
                {label}
              </Button>
            );
          })}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
