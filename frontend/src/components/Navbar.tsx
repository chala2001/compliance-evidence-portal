import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { ShieldUserIcon } from "@oxygen-ui/react-icons";
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
    <AppBar position="sticky" color="primary" elevation={0}>
      <Toolbar sx={{ minHeight: { xs: 60, sm: 68 } }}>
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1.25, flexGrow: 1, cursor: "pointer" }}
          onClick={() => navigate("/")}
        >
          <ShieldUserIcon size={26} />
          <Typography variant="h6" fontWeight={700} letterSpacing="-0.01em">
            Compliance Portal
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {navItems.map(({ label, to }) => {
            const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <Button
                key={to}
                color="inherit"
                onClick={() => navigate(to)}
                sx={{
                  px: 2,
                  py: 1,
                  opacity: active ? 1 : 0.8,
                  borderBottom: active ? "2px solid white" : "2px solid transparent",
                  borderRadius: 0,
                  fontWeight: active ? 700 : 500,
                  transition: "opacity 150ms ease, background 150ms ease",
                  "&:hover": { opacity: 1, backgroundColor: "rgba(255,255,255,0.08)" },
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
