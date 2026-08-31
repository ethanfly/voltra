package services

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// StorageService 使用本地 JSON 文件持久化数据（接口集合、环境变量、历史记录）
//
// 设计说明：
//   - 具体的数据结构（Collection、Environment 等）交给前端 TypeScript 定义和维护，
//     Go 侧只负责"存和取整段 JSON 文本"，这样前端迭代数据结构时不需要跟着改 Go 代码
//   - 数据文件存放在系统标准的用户配置目录下，方便用户手动备份/用 Git 管理：
//     macOS: ~/Library/Application Support/voltra
//     Windows: %APPDATA%/voltra
//     Linux: ~/.config/voltra
type StorageService struct {
	mu      sync.Mutex
	baseDir string
}

func NewStorageService() (*StorageService, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("获取用户配置目录失败: %w", err)
	}
	baseDir := filepath.Join(configDir, "voltra")
	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建数据目录失败: %w", err)
	}
	return &StorageService{baseDir: baseDir}, nil
}

const (
	fileCollections  = "collections.json"
	fileEnvironments = "environments.json"
	fileHistory      = "history.json"
)

// LoadCollections 读取接口集合数据，文件不存在时返回空数组 "[]"
func (s *StorageService) LoadCollections() (string, error) {
	return s.load(fileCollections, "[]")
}

// SaveCollections 保存接口集合数据，data 是前端序列化好的 JSON 字符串
func (s *StorageService) SaveCollections(data string) error {
	return s.save(fileCollections, data)
}

// LoadEnvironments 读取环境变量配置
func (s *StorageService) LoadEnvironments() (string, error) {
	return s.load(fileEnvironments, "[]")
}

// SaveEnvironments 保存环境变量配置
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
