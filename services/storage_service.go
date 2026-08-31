package services

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// StorageService 使用本地 JSON 文件持久化数据（项目、环境、历史记录、设置、UI 状态）
//
// 设计说明：
//   - 具体的数据结构（Project、Environment 等）交给前端 TypeScript 定义和维护，
//     Go 侧只负责"存和取整段 JSON 文本"，这样前端迭代数据结构时不需要跟着改 Go 代码
//   - 数据文件存放在系统标准的用户配置目录下，方便用户手动备份/用 Git 管理：
//     macOS: ~/Library/Application Support/voltra
//     Windows: %APPDATA%/voltra
//     Linux: ~/.config/voltra
type StorageService struct {
	mu      sync.Mutex
	baseDir string
	app     *application.App
}

func NewStorageService() (*StorageService, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("获取用户配置目录失败: %w", err)
	}
	return newStorageServiceIn(filepath.Join(configDir, "voltra"))
}

// newStorageServiceIn 供单元测试注入临时目录
func newStorageServiceIn(dir string) (*StorageService, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("创建数据目录失败: %w", err)
	}
	return &StorageService{baseDir: dir}, nil
}

// BindApp 在 main.go 里，application.New(...) 创建完 app 之后调用，
// 这样 StorageService 才能拿到 app 实例用于弹出原生文件对话框
func (s *StorageService) BindApp(app *application.App) {
	s.app = app
}

const (
	fileCollections  = "collections.json"
	fileEnvironments = "environments.json"
	fileHistory      = "history.json"
	fileProjects     = "projects.json"
	fileSettings     = "settings.json"
	fileUIState      = "ui-state.json"
)

// LoadProjects 读取项目数据（含集合/环境/变量），文件不存在时返回 "[]"
func (s *StorageService) LoadProjects() (string, error) {
	return s.load(fileProjects, "[]")
}

// SaveProjects 保存项目数据，data 是前端序列化好的 JSON 字符串
func (s *StorageService) SaveProjects(data string) error {
	return s.save(fileProjects, data)
}

// LoadSettings 读取应用设置
func (s *StorageService) LoadSettings() (string, error) {
	return s.load(fileSettings, "{}")
}

// SaveSettings 保存应用设置
func (s *StorageService) SaveSettings(data string) error {
	return s.save(fileSettings, data)
}

// LoadUIState 读取 UI 状态（打开的标签、侧栏宽度、分栏比例等）
func (s *StorageService) LoadUIState() (string, error) {
	return s.load(fileUIState, "{}")
}

// SaveUIState 保存 UI 状态
func (s *StorageService) SaveUIState(data string) error {
	return s.save(fileUIState, data)
}

// LoadCollections 读取旧版接口集合数据（保留一个版本做迁移读取）
func (s *StorageService) LoadCollections() (string, error) {
	return s.load(fileCollections, "[]")
}

// SaveCollections 保存旧版接口集合数据
func (s *StorageService) SaveCollections(data string) error {
	return s.save(fileCollections, data)
}

// LoadEnvironments 读取全局环境变量配置
func (s *StorageService) LoadEnvironments() (string, error) {
	return s.load(fileEnvironments, "[]")
}

// SaveEnvironments 保存全局环境变量配置
func (s *StorageService) SaveEnvironments(data string) error {
	return s.save(fileEnvironments, data)
}

// LoadHistory 读取请求历史记录
func (s *StorageService) LoadHistory() (string, error) {
	return s.load(fileHistory, "[]")
}

// SaveHistory 保存请求历史记录
func (s *StorageService) SaveHistory(data string) error {
	return s.save(fileHistory, data)
}

// QuarantineCorruptFile 把损坏的数据文件重命名为 <name>.corrupt.<unix秒>，
// 让前端以空数据启动的同时保留现场便于排查；文件不存在时静默返回
func (s *StorageService) QuarantineCorruptFile(filename string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.baseDir, filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil
	}
	backup := fmt.Sprintf("%s.corrupt.%d", path, time.Now().Unix())
	if err := os.Rename(path, backup); err != nil {
		return fmt.Errorf("隔离损坏文件 %s 失败: %w", filename, err)
	}
	return nil
}

// BackupFile 重命名数据目录下的文件 from → from+suffix（suffix 形如 ".migrated-20260831"），
// 用于迁移前备份；文件不存在时静默返回
func (s *StorageService) BackupFile(from, suffix string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.baseDir, from)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil
	}
	if err := os.Rename(path, path+suffix); err != nil {
		return fmt.Errorf("备份文件 %s 失败: %w", from, err)
	}
	return nil
}

// OpenDataDir 用系统文件管理器打开数据目录
func (s *StorageService) OpenDataDir() error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", s.baseDir)
	case "windows":
		cmd = exec.Command("explorer", s.baseDir)
	default:
		cmd = exec.Command("xdg-open", s.baseDir)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("打开数据目录失败: %w", err)
	}
	return nil
}

// PickFile 弹出原生"打开文件"对话框，返回所选文件路径；用户取消返回空字符串
func (s *StorageService) PickFile() (string, error) {
	if s.app == nil {
		return "", fmt.Errorf("文件对话框暂不可用")
	}
	return s.app.Dialog.OpenFile().
		SetTitle("选择文件").
		PromptForSingleSelection()
}

// ReadFile 读取任意路径文件的内容（与 PickFile 配对，用于导入 Postman 集合/环境等）。
// 限制 10MB，防止超大文件拖垮内存
func (s *StorageService) ReadFile(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	const maxImportBytes = 10 << 20
	if info.Size() > maxImportBytes {
		return "", fmt.Errorf("文件过大（超过 10MB）: %s", path)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	return string(content), nil
}

// SaveFile 弹出原生"保存文件"对话框并把 data 写入所选路径，
// defaultName 为建议文件名（含扩展名）。
// 返回值：成功 → (所选路径, nil)；用户取消 → ("", nil)；失败 → ("", err)
func (s *StorageService) SaveFile(defaultName, data string) (string, error) {
	if s.app == nil {
		return "", fmt.Errorf("文件对话框暂不可用")
	}
	path, err := s.app.Dialog.SaveFile().
		SetFilename(defaultName).
		PromptForSingleSelection()
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil
	}
	if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
		return "", fmt.Errorf("写入 %s 失败: %w", path, err)
	}
	return path, nil
}

// GetDataDir 暴露数据目录路径给前端展示（方便用户知道去哪里备份数据）
func (s *StorageService) GetDataDir() string {
	return s.baseDir
}

func (s *StorageService) load(filename, defaultValue string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.baseDir, filename)
	content, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return defaultValue, nil
	}
	if err != nil {
		return "", fmt.Errorf("读取 %s 失败: %w", filename, err)
	}
	return string(content), nil
}

func (s *StorageService) save(filename, data string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.baseDir, filename)
	// 写临时文件再重命名，避免写入过程中崩溃导致数据文件损坏
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, []byte(data), 0o644); err != nil {
		return fmt.Errorf("写入 %s 失败: %w", filename, err)
	}
	return os.Rename(tmpPath, path)
}
