# 构建 Docker 镜像实践

## 构建上下文

执行 `docker build` 命令时，当前的工作目录被称为构建上下文。默认情况下，Dockerfile 就位于该路径下。也可以通过 -f 参数来指定 dockerfile ，但 docker 客户端会将当前工作目录下的所有文件发送到 docker 守护进程进行构建。所以来说，当执行 docker build 进行构建镜像时，当前目录一定要 `干净` ，切记不要在家里录下创建一个 `Dockerfile` 紧接着 `docker build` 全部一起执行。

正确做法是为项目建立一个文件夹，把构建镜像时所需要的资源放在这个文件夹下。比如这样：

```
mkdir project
cd !$
vi Dockerfile
# 编写 Dockerfile
```

tips：也可以通过 `.dockerignore` 文件来忽略不需要的文件发送到 docker 守护进程

## 基础镜像

使用体积较小的基础镜像，比如 `alpine` 或者 `debian:buster-slim`，像 openjdk 可以选用 `openjdk:xxx-slim` ，由于 openjdk 是基于 debian 的基础镜像构建的，所以向 debian 基础镜像一样，后面带个 `slim` 就是基于 `debian:xxx-slim` 镜像构建的。



```
[root@node2 test]# docker pull debian:buster-slim
[root@node2 test]# docker pull alpine

[root@node2 test]# docker images|grep "debain\|alpine"
nginx                                                          alpine                 cc44224bfe20   14 months ago   23.5MB
alpine                                                         latest                 c059bfaa849c   15 months ago   5.59MB
```

不过需要注意的是，alpine 的 c 库是 `musl libc` ，而不是正统的 `glibc` ，另外对于一些依赖 `glibc` 的大型项目，像 openjdk 、tomcat、rabbitmq 等都不建议使用 alpine 基础镜像，因为 `musl libc` 可能会导致 jvm 一些奇怪的问题。这也是为什么 tomcat 官方没有给出基础镜像是 alpine 的 Dockerfile 的原因。

## 国内软件源

使用默认的软件源安装构建时所需的依赖，对于绝大多数基础镜像来说，在国内网络环境构建时的速度较慢，可以通过修改软件源的方式更换为国内的软件源镜像站。目前国内稳定可靠的镜像站主要有，华为云、阿里云、腾讯云、163 等。

### 对于 alpine 基础镜像修改软件源

```
echo "http://mirrors.huaweicloud.com/alpine/latest-stable/main/" > /etc/apk/repositories ;\
echo "http://mirrors.huaweicloud.com/alpine/latest-stable/community/" >> /etc/apk/repositories ;\
apk update ;\
```

### debian 基础镜像修改默认原件源码

```
sed -i 's/deb.debian.org/mirrors.huaweicloud.com/g' /etc/apt/sources.list ;\
sed -i 's|security.debian.org/debian-security|mirrors.huaweicloud.com/debian-security|g' /etc/apt/sources.list ;\
apt update ;\
```

### Ubuntu 基础镜像修改默认原件源码

```
sed -i 's/archive.ubuntu.com/mirrors.huaweicloud.com/g' /etc/apt/sources.list
apt update ;\
```

建议这些命令就放在 RUN 指令的第一条，update 以下软件源，之后再 install 相应的依赖。

至于centos，基础镜像相对太大

## 时区设置

由于绝大多数基础镜像都是默认采用 UTC 的时区，与北京时间相差 8 个小时，这将会导致容器内的时间与北京时间不一致，因而会对一些应用造成一些影响，还会影响容器内日志和监控的数据。因此对于东八区的用户，最好在构建镜像的时候设定一下容器内的时区，一以免以后因为时区遇到一些 bug。可以通过环境变量设置容器内的时区。在启动的时候可以通过设置环境变量 `-e TZ=Asia/Shanghai` 来设定容器内的时区。

### alpine

对于 alpine 基础镜像无法通过 `TZ` 环境变量的方式设定时区，需要安装 `tzdata` 来配置时区。

```
[root@node2 test]# docker run --rm -it -e TZ=Asia/Shanghai alpine date
Fri Mar 17 09:55:45 UTC 2023
```

对于 alpine 基础镜像，可以在 RUN 指令后面追加上以下命令

```
apk add --no-cache tzdata ;\
cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime ;\
echo "Asia/Shanghai" > /etc/timezone ;\
apk del tzdata ;\
```

### 通过 tzdate 设定时区

```
[root@node2 test]# cat Dockerfile
FROM alpine
RUN set -xue ;\
echo "http://mirrors.huaweicloud.com/alpine/latest-stable/main/" > /etc/apk/repositories ;\
echo "http://mirrors.huaweicloud.com/alpine/latest-stable/community/" >> /etc/apk/repositories ;\
apk update ;\
apk add --no-cache tzdata ;\
cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime ;\
echo "Asia/Shanghai" > /etc/timezone ;\
apk del tzdata

[root@node2 test]# docker build -t alpine:tz .
[+] Building 16.6s (6/6) FINISHED
 => [internal] load .dockerignore                                                                          0.3s
 => => transferring context: 2B                                                                            0.1s
 => [internal] load build definition from Dockerfile                                                       0.3s
 => => transferring dockerfile: 411B                                                                       0.1s
 => [internal] load metadata for docker.io/library/alpine:latest                                           0.0s
 => [1/2] FROM docker.io/library/alpine                                                                    0.0s
 => [2/2] RUN set -xue ;echo "http://mirrors.huaweicloud.com/alpine/latest-stable/main/" > /etc/apk/repo  16.0s
 => exporting to image                                                                                     0.1s
 => => exporting layers                                                                                    0.1s
 => => writing image sha256:fd6f4521fa3f003ffc4293714c8ff089cebed916170412ce20469fff8903e781               0.0s
 => => naming to docker.io/library/alpine:tz                                                               0.0s
 
[root@node2 test]# docker images|grep alpine
alpine                                                         tz                     fd6f4521fa3f   17 seconds ago   8.2MB
nginx                                                          alpine                 cc44224bfe20   14 months ago    23.5MB
alpine                                                         latest                 c059bfaa849c   15 months ago    5.59MB
[root@node2 test]# docker run --rm -it alpine:tz date  #已经是CST
Fri Mar 17 18:02:28 CST 2023

[root@node2 test]# docker run --rm -it alpine:latest date
Fri Mar 17 10:02:44 UTC 2023

```



### debian

通过启动时设定环境变量指定时区

```
[root@node2 test]# docker run --rm -it -e TZ=Asia/Shanghai debian date
Fri Mar 17 18:05:59 CST 2023
```

可以再构建镜像的时候复制时区文件设定容器内时区

```
cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime ;\
echo "Asia/shanghai" > /etc/timezone ;\
```

### ubuntu

```
apt update ;\
apt install tzdata -y ;\
cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime ;\
echo "Asia/shanghai" > /etc/timezone ;\
```

## 尽量使用 URL 添加源码

如果不采用分阶段构建，对于一些需要在容器内进行编译的项目，最好通过 git 或者 wegt 的方式将源码打入到镜像内，而非采用 ADD 或者 COPY ，因为源码编译完成之后，源码就不需要可以删掉了，而通过 ADD 或者 COPY 添加进去的源码已经用在下一层镜像中了，是删不掉滴啦。也就是说 `git & wget source `然后 `build` ，最后 `rm -rf source/` 这三部放在一条 RUN 指令中，这样就能避免源码添加到镜像中而增大镜像体积。

### 使用虚拟编译环境

对于只在编译过程中使用到的依赖，我们可以将这些依赖安装在虚拟环境中，编译完成之后可以一并删除这些依赖，比如 alpine 中可以使用 `apk add --no-cache --virtual .build-deps` ，后面加上需要安装的相关依赖。

```
apk add --no-cache --virtual .build-deps gcc libc-dev make perl-dev openssl-dev pcre-dev zlib-dev git
```



### 最小化层数

docker 在 1.10 以后，只有 `RUN、COPY 和 ADD` 指令会创建层，其他指令会创建临时的中间镜像，但是不会直接增加构建的镜像大小了。前文提到了建议使用 git 或者 wget 的方式来将文件打入到镜像当中，但如果我们必须要使用 COPY 或者 ADD 指令呢？

还是拿 FastDFS 为例:

```
# centos 7
FROM centos:7
# 添加配置文件
# add profiles
ADD conf/client.conf /etc/fdfs/
ADD conf/http.conf /etc/fdfs/
ADD conf/mime.types /etc/fdfs/
ADD conf/storage.conf /etc/fdfs/
ADD conf/tracker.conf /etc/fdfs/
ADD fastdfs.sh /home
ADD conf/nginx.conf /etc/fdfs/
ADD conf/mod_fastdfs.conf /etc/fdfs

# 添加源文件
# add source code
ADD source/libfastcommon.tar.gz /usr/local/src/
ADD source/fastdfs.tar.gz /usr/local/src/
ADD source/fastdfs-nginx-module.tar.gz /usr/local/src/
ADD source/nginx-1.15.4.tar.gz /usr/local/src/
```

多个文件需要添加到容器中不同的路径，每个文件使用一条 ADD 指令的话就会增加一层镜像，这样戏曲就多了 12 层镜像 。其实大可不必，我们可以将这些文件全部打包为一个文件为 `src.tar.gz` 然后通过 ADD 的方式把文件添加到当中去，然后在 RUN 指令后使用 `mv` 命令把文件移动到指定的位置。这样仅仅一条 ADD 和 RUN 指令取代掉了 12 个 ADD 指令 

```
FROM alpine:3.10
COPY src.tar.gz /usr/local/src.tar.gz
RUN set -xe \
    && apk add --no-cache --virtual .build-deps gcc libc-dev make perl-dev openssl-dev pcre-dev zlib-dev tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && tar -xvf /usr/local/src.tar.gz -C /usr/local \
    && mv /usr/local/src/conf/fastdfs.sh /home/fastdfs/ \
    && mv /usr/local/src/conf/* /etc/fdfs \
    && chmod +x /home/fastdfs/fastdfs.sh \
    && rm -rf /usr/local/src/* /var/cache/apk/* /tmp/* /var/tmp/* $HOME/.cache
VOLUME /var/fdfs
```

其他最小化层数无非就是把构建项目的整个步骤弄成一条 RUN 指令，不过多条命令合并可以使用 `&&` 或者 `;` 这两者都可以，不过据我在 docker hub 上的所见所闻，使用 `;` 的居多，尤其是官方的 `Dockerfile` 。
