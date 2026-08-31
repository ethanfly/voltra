package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestStorage(t *testing.T) *StorageService {
	t.Helper()
	s, err := newStorageServiceIn(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestLoadDefaults(t *testing.T) {
	s := newTestStorage(t)
	cases := []struct {
		name string
		fn   func() (string, error)
		want string
	}{
		{"projects", s.LoadProjects, "[]"},
		{"settings", s.LoadSettings, "{}"},
		{"uiState", s.LoadUIState, "{}"},
		{"collections", s.LoadCollections, "[]"},
		{"environments", s.LoadEnvironments, "[]"},
		{"history", s.LoadHistory, "[]"},
	}
	for _, c := range cases {
		got, err := c.fn()
		if err != nil {
			t.Errorf("%s: unexpected error: %v", c.name, err)
			continue
		}
		if got != c.want {
			t.Errorf("%s default = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestSaveRoundTrip(t *testing.T) {
	s := newTestStorage(t)
	data := `[{"id":"p1","name":"测试项目"}]`
	if err := s.SaveProjects(data); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadProjects()
	if err != nil {
		t.Fatal(err)
	}
	if got != data {
		t.Errorf("round trip = %q, want %q", got, data)
	}
	// 原子写：不应残留 .tmp 文件
	entries, _ := os.ReadDir(s.baseDir)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("leftover tmp file: %s", e.Name())
		}
	}
}

// 坏 JSON 原样返回：Go 侧不校验内容，隔离由前端判断
func TestLoadReturnsCorruptContentVerbatim(t *testing.T) {
	s := newTestStorage(t)
	if err := s.SaveProjects("{broken json"); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadProjects()
	if err != nil {
		t.Fatal(err)
	}
	if got != "{broken json" {
		t.Errorf("got %q", got)
	}
}

func TestQuarantineCorruptFile(t *testing.T) {
	s := newTestStorage(t)
	// 文件不存在 → 静默
	if err := s.QuarantineCorruptFile("nope.json"); err != nil {
		t.Errorf("missing file should be no-op, got %v", err)
	}
	// 存在 → 重命名为 .corrupt.<秒>
	if err := s.SaveSettings(`{"a":1}`); err != nil {
		t.Fatal(err)
	}
	if err := s.QuarantineCorruptFile("settings.json"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(s.baseDir, "settings.json")); !os.IsNotExist(err) {
		t.Errorf("settings.json should be gone")
	}
	got, _ := s.LoadSettings()
	if got != "{}" {
		t.Errorf("after quarantine default = %q", got)
	}
}

func TestBackupFile(t *testing.T) {
	s := newTestStorage(t)
	if err := s.BackupFile("nope.json", ".migrated"); err != nil {
		t.Errorf("missing file should be no-op, got %v", err)
	}
	if err := s.SaveProjects(`[1]`); err != nil {
		t.Fatal(err)
	}
	if err := s.BackupFile("projects.json", ".migrated-test"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(s.baseDir, "projects.json.migrated-test")); err != nil {
		t.Errorf("backup missing: %v", err)
	}
}

func TestGetDataDir(t *testing.T) {
	s := newTestStorage(t)
	if s.GetDataDir() == "" {
		t.Error("GetDataDir empty")
	}
}
