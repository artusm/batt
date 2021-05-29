package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path"
	"strings"
	"text/template"

	"github.com/alecthomas/kong"
	"github.com/pkg/errors"
)

type Vars struct {
	ESProxy              bool     `env:"ES_PROXY" default:"true" help:"ES_PROXY"`
	ESURL                string   `env:"ES_URL" name:"es-url" help:"ES_URL"`
	ESIndex              string   `env:"ES_INDEX" default:"*" help:"ES_INDEX"`
	TimestampField       string   `env:"TIMESTAMP_FIELD" default:"@timestamp" help:"TIMESTAMP_FIELD"`
	DisableTimestampNano bool     `env:"DISABLE_TIMESTAMP_NANO" default:"false" help:"DISABLE_TIMESTAMP_NANO"`
	SecondaryIndex       string   `env:"SECONDARY_INDEX" default:"" help:"SECONDARY_INDEX"`
	LevelField           string   `env:"LEVEL_FIELD" default:"level" help:"LEVEL_FIELD"`
	MessageField         string   `env:"MESSAGE_FIELD" default:"message" help:"MESSAGE_FIELD"`
	IgnoredFields        []string `env:"IGNORED_FIELDS" default:"_id,_index" help:"IGNORED_FIELDS"`
	IgnoredFieldsJoined  string   `hidden:""`
}

const lqTemplate = "config.json"
const lqDest = "/lq/config.json"
const nginxTemplate = "nginx"
const nginxDest = "/etc/nginx/conf.d/lq.conf"

func main() {
	err := run()
	if err != nil {
		log.Fatalf("%+v\n", err)
	}
}

func run() error {
	vars := Vars{}
	kong.Parse(&vars)
	log.Printf("Переменные:\n%+v", vars)

	if exists(lqDest) {
		log.Printf("%s уже создана.", lqDest)
	}

	if !exists(lqDest) && !exists(nginxDest) && vars.ESURL == "" {
		return errors.Errorf("ES_URL (--es-url) не указан.")
	}

	vars.IgnoredFieldsJoined = fmt.Sprintf(`"%s"`, strings.Join(vars.IgnoredFields, `","`))

	err := tmpl(nginxTemplate, nginxDest, vars)
	if err != nil {
		return err
	}

	log.Printf("Запускаем nginx...")
	err = stream("nginx", "-g", "daemon off;")
	if err != nil {
		return errors.Wrapf(err, "Ошибка при запуске nginx")
	}

	return nil
}

func tmpl(name, dst string, vars Vars) error {
	src := fmt.Sprintf("/templates/%s", name)
	if exists(dst) {
		return nil
	}

	t, err := template.New(path.Base(src)).ParseFiles(src)
	if err != nil {
		panic(err)
	}

	fp, err := os.Create(dst)
	if err != nil {
		return errors.Wrapf(err, "Не удалось создать %s", dst)
	}

	err = t.Execute(fp, &vars)
	if err != nil {
		return errors.Wrapf(err, "Не удалось выполнить шаблон %s", dst)
	}

	log.Print("Шаблон сгенерирован", dst)
	return nil
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func stream(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
